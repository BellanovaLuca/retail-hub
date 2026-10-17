/**
 * Responsabilità (§8.4): logica pura, senza accesso al database.
 *
 * - chi deve svolgere un'attività in una certa data, in base ai turni pubblicati;
 * - lo stato delle caselle del tabellone;
 * - chi può spuntare una casella.
 */

export type ISODate = string; // yyyy-MM-dd

export type AssigneeRole = "owner" | "support";

export type ResponsibilityAssignment = {
  id: string;
  title: string;
  /** 1 = lunedì … 7 = domenica. */
  scheduleDays: number[];
  allStaff: boolean;
  active?: boolean;
  ownerId: string | null;
  /** Supporti nell'ordine di sostituzione (sort_order). */
  supportIds: string[];
};

/** Turno pubblicato ridotto a quello che serve qui. */
export type ShiftLike = { profile_id: string; date: ISODate; is_absence: boolean };

/** 1 = lunedì … 7 = domenica, da una data ISO (senza dipendere dal fuso del server). */
export function isoWeekdayOf(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ((day + 6) % 7) + 1;
}

export function isScheduledOn(scheduleDays: number[], date: ISODate): boolean {
  return scheduleDays.includes(isoWeekdayOf(date));
}

/** Data ISO spostata di `days` giorni. */
export function shiftDate(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Chi lavora in una data: chi ha almeno un turno pubblicato che non sia un'assenza.
 * Restituisce `null` se per quella data non risulta alcun turno pubblicato (settimana non
 * ancora pubblicata, oppure negozio chiuso): in quel caso non si può dire chi c'è.
 */
export function peopleOnShift(shifts: ShiftLike[], date: ISODate): Set<string> | null {
  const ofDay = shifts.filter((s) => s.date === date);
  if (ofDay.length === 0) return null;
  return new Set(ofDay.filter((s) => !s.is_absence).map((s) => s.profile_id));
}

export type Duty =
  /** Il responsabile è in turno (o i turni non sono noti). */
  | { kind: "owner"; profileId: string }
  /** Il responsabile non c'è: tocca al primo supporto in turno. */
  | { kind: "substitute"; profileId: string; replacingId: string }
  /** Nessun responsabile indicato: tocca al primo supporto in turno. */
  | { kind: "support"; profileId: string }
  /** Attività per tutti: la fa chiunque sia in turno. */
  | { kind: "all_staff" }
  /** Nessuno degli assegnati è in turno (o nessuno è assegnato). */
  | { kind: "uncovered" }
  /** Giorno non previsto o attività disattivata. */
  | { kind: "not_scheduled" };

/**
 * Chi deve svolgere l'attività nella data indicata.
 *
 * `onShift` = persone in turno quel giorno; `null` se i turni non sono noti: allora vale
 * l'assegnazione "di carta" (il responsabile, o in mancanza il primo supporto).
 */
export function resolveDuty(
  r: ResponsibilityAssignment,
  date: ISODate,
  onShift: Set<string> | null,
): Duty {
  if (r.active === false || !isScheduledOn(r.scheduleDays, date)) return { kind: "not_scheduled" };
  if (r.allStaff) return { kind: "all_staff" };

  const present = (id: string) => onShift === null || onShift.has(id);

  if (r.ownerId && present(r.ownerId)) return { kind: "owner", profileId: r.ownerId };
  const support = r.supportIds.find((id) => id !== r.ownerId && present(id));
  if (support) {
    return r.ownerId
      ? { kind: "substitute", profileId: support, replacingId: r.ownerId }
      : { kind: "support", profileId: support };
  }
  return { kind: "uncovered" };
}

export type DutyForPerson = {
  responsibility: ResponsibilityAssignment;
  role: "owner" | "substitute" | "support" | "all_staff";
  replacingId?: string;
};

/**
 * Le attività che toccano a una persona in una data ("Oggi tocca a te").
 * Le attività per tutti compaiono solo a chi è in turno (o se i turni non sono noti).
 */
export function dutiesForPerson(
  responsibilities: ResponsibilityAssignment[],
  profileId: string,
  date: ISODate,
  onShift: Set<string> | null,
): DutyForPerson[] {
  const out: DutyForPerson[] = [];
  for (const r of responsibilities) {
    const duty = resolveDuty(r, date, onShift);
    switch (duty.kind) {
      case "owner":
      case "support":
        if (duty.profileId === profileId) out.push({ responsibility: r, role: duty.kind });
        break;
      case "substitute":
        if (duty.profileId === profileId)
          out.push({ responsibility: r, role: "substitute", replacingId: duty.replacingId });
        break;
      case "all_staff":
        if (onShift === null || onShift.has(profileId))
          out.push({ responsibility: r, role: "all_staff" });
        break;
    }
  }
  return out;
}

/** Attività previste nella data per cui nessuno degli assegnati è in turno. */
export function uncoveredOn(
  responsibilities: ResponsibilityAssignment[],
  date: ISODate,
  onShift: Set<string> | null,
): ResponsibilityAssignment[] {
  // Senza turni pubblicati non si sa chi c'è: niente allarmi a vuoto.
  if (onShift === null) return [];
  return responsibilities.filter((r) => resolveDuty(r, date, onShift).kind === "uncovered");
}

export type CellState =
  /** Spuntata: nero pieno. */
  | "done"
  /** Prevista e non ancora fatta (oggi o nel futuro): contorno. */
  | "pending"
  /** Prevista e non svolta a giornata finita: rosso tenue. */
  | "missed"
  /** Giorno non previsto: grigio, non cliccabile. */
  | "off";

export function cellState(args: {
  scheduled: boolean;
  checked: boolean;
  date: ISODate;
  today: ISODate;
}): CellState {
  if (args.checked) return "done";
  if (!args.scheduled) return "off";
  return args.date < args.today ? "missed" : "pending";
}

/**
 * Chi può spuntare (o togliere la spunta): gli admin sempre; gli assegnati (o tutti, se
 * l'attività è per tutti) solo per oggi o ieri. Rispecchia la policy RLS.
 */
export function canToggleCheck(args: {
  isAdmin: boolean;
  isAssignee: boolean;
  allStaff: boolean;
  date: ISODate;
  today: ISODate;
}): boolean {
  if (args.isAdmin) return true;
  if (!args.isAssignee && !args.allStaff) return false;
  return args.date === args.today || args.date === shiftDate(args.today, -1);
}

/** Etichetta della persona di turno per la casella di oggi, per il tabellone. */
export function dutyLabel(duty: Duty, name: (id: string) => string): string | null {
  switch (duty.kind) {
    case "owner":
    case "support":
      return name(duty.profileId);
    case "substitute":
      return `${name(duty.profileId)} (sostituisce ${name(duty.replacingId)})`;
    case "all_staff":
      return "Tutti";
    case "uncovered":
      return "Nessuno in turno";
    case "not_scheduled":
      return null;
  }
}
