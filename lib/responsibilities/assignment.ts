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
  /**
   * Supporti nell'ordine di sostituzione (sort_order). Con `weekly` sono invece le persone
   * assegnate per la settimana, tutte alla pari (e `ownerId` è null).
   */
  supportIds: string[];
  /** Assegnazione settimanale: chi del gruppo è in turno fa l'attività. */
  weekly?: boolean;
  /**
   * Con `weekly`: i giorni (1 = lunedì … 7 = domenica) in cui ciascun assegnato fa l'attività.
   * `scheduleDays` è allora l'unione dei giorni di tutti.
   */
  personDays?: PersonDays;
};

/** Giorni della settimana (1–7) per persona. */
export type PersonDays = Record<string, number[]>;

/** Giorni validi, senza ripetizioni e in ordine. */
export function normalizeDays(days: readonly number[]): number[] {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort(
    (a, b) => a - b,
  );
}

/** Toglie chi non ha giorni e mette in ordine i giorni degli altri. */
export function normalizePersonDays(personDays: PersonDays): PersonDays {
  const out: PersonDays = {};
  for (const [id, days] of Object.entries(personDays)) {
    const clean = normalizeDays(days);
    if (clean.length) out[id] = clean;
  }
  return out;
}

export function samePersonDays(a: PersonDays, b: PersonDays): boolean {
  const x = normalizePersonDays(a);
  const y = normalizePersonDays(b);
  const keys = Object.keys(x);
  return (
    keys.length === Object.keys(y).length &&
    keys.every((id) => y[id] !== undefined && x[id].join() === y[id].join())
  );
}

/** Lunedì della settimana che contiene la data. */
export function mondayOf(date: ISODate): ISODate {
  return shiftDate(date, 1 - isoWeekdayOf(date));
}

/**
 * Assegnazione di un'attività per una settimana (lunedì): le persone e, per ciascuna, i giorni
 * (chi non compare in `personDays` fa tutti i giorni previsti dall'attività).
 */
export type WeekTeam = { weekStart: ISODate; profileIds: string[]; personDays?: PersonDays };

/**
 * Assegnazione in vigore nella settimana: quella della settimana stessa o, in mancanza,
 * dell'ultima settimana precedente assegnata (si ripete finché non si cambia). `null` = mai
 * assegnata per settimana: valgono responsabile e supporti della scheda.
 */
export function effectiveWeekPlan(plans: WeekTeam[], weekStart: ISODate): WeekTeam | null {
  let best: WeekTeam | null = null;
  for (const p of plans) {
    if (p.weekStart <= weekStart && (!best || p.weekStart > best.weekStart)) best = p;
  }
  return best;
}

/** Solo le persone dell'assegnazione in vigore (vedi `effectiveWeekPlan`). */
export function effectiveWeekTeam(plans: WeekTeam[], weekStart: ISODate): string[] | null {
  const best = effectiveWeekPlan(plans, weekStart);
  return best ? [...best.profileIds] : null;
}

/**
 * Applica l'assegnazione della settimana (se c'è) a un'attività. Con i giorni per persona,
 * l'attività risulta prevista solo nei giorni in cui qualcuno è assegnato; se non è assegnato
 * nessuno restano i giorni della scheda (così si vede che è scoperta).
 */
export function withWeekTeam<T extends ResponsibilityAssignment>(
  r: T,
  team: string[] | null,
  personDays?: PersonDays,
): T {
  if (team === null || r.allStaff) return r;
  const days: PersonDays = {};
  for (const id of team) {
    const own = normalizeDays(personDays?.[id] ?? r.scheduleDays);
    if (own.length) days[id] = own;
  }
  const ids = team.filter((id) => days[id]);
  return {
    ...r,
    ownerId: null,
    supportIds: ids,
    weekly: true,
    personDays: days,
    scheduleDays: ids.length ? normalizeDays(Object.values(days).flat()) : r.scheduleDays,
  };
}

/**
 * Giorni (1–7) in cui la persona ha l'attività: i suoi giorni nell'assegnazione settimanale,
 * oppure i giorni previsti se è responsabile/supporto della scheda o l'attività è per tutti.
 */
export function daysOfPerson(r: ResponsibilityAssignment, profileId: string): number[] {
  if (r.allStaff) return r.scheduleDays;
  if (r.weekly) {
    if (!r.supportIds.includes(profileId)) return [];
    return r.personDays?.[profileId] ?? r.scheduleDays;
  }
  return r.ownerId === profileId || r.supportIds.includes(profileId) ? r.scheduleDays : [];
}

/** La persona ha l'attività in quella data? */
export function isAssignedOn(
  r: ResponsibilityAssignment,
  profileId: string,
  date: ISODate,
): boolean {
  return daysOfPerson(r, profileId).includes(isoWeekdayOf(date));
}

/** Giorni per persona di tutti gli assegnati (anche responsabile e supporti della scheda). */
export function personDaysOf(r: ResponsibilityAssignment): PersonDays {
  if (r.allStaff) return {};
  return Object.fromEntries(assigneeIds(r).map((id) => [id, daysOfPerson(r, id)]));
}

/** Assegnati effettivi (responsabile, supporti o gruppo della settimana), senza ripetizioni. */
export function assigneeIds(r: ResponsibilityAssignment): string[] {
  return [...new Set([...(r.ownerId ? [r.ownerId] : []), ...r.supportIds])];
}

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
  /** Assegnazione settimanale: la fanno gli assegnati del giorno che sono in turno (o tutti gli
   *  assegnati del giorno, se i turni non sono noti). */
  | { kind: "team"; profileIds: string[] }
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

  if (r.weekly) {
    const team = r.supportIds.filter((id) => isAssignedOn(r, id, date) && present(id));
    return team.length ? { kind: "team", profileIds: team } : { kind: "uncovered" };
  }

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
  /** Assegnazione settimanale: gli altri del gruppo in turno quel giorno. */
  teammateIds?: string[];
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
      case "team":
        if (duty.profileIds.includes(profileId))
          out.push({
            responsibility: r,
            role: "owner",
            teammateIds: duty.profileIds.filter((id) => id !== profileId),
          });
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
    case "team":
      return duty.profileIds.map(name).join(", ");
    case "all_staff":
      return "Tutti";
    case "uncovered":
      return "Nessuno in turno";
    case "not_scheduled":
      return null;
  }
}
