/**
 * Indicatori di copertura per fascia (§7.1, §7.2): TESTE, DELTA, Vista, Sole, COP. OTT.
 *
 * Scelte documentate:
 * - Una persona è presente in una fascia se un suo turno copre TUTTA la fascia
 *   (con fasce da 30' un turno 10:15–… conta dalla fascia 10:30–11:00).
 * - Le pause (`breakMinutes`) non hanno una posizione nella giornata, quindi NON riducono la
 *   presenza: riducono solo le ore. Per far "vedere" una pausa alle coperture, il turno va spezzato
 *   (es. 10–13 e 14–19, come nel foglio orario).
 * - Back office: se nella fascia la persona ha solo turni in back office conta in TESTE ma non nella
 *   forza vendita; se ha anche un turno di vendita che copre la fascia, conta come vendita.
 * - Area: quella del turno; se manca, l'area di base della persona (i jolly senza area non contano
 *   né in Vista né in Sole, ma contano in DELTA).
 * - Reparto (COP. OTT.): `shift.departmentId ?? persona.primaryDepartmentId`. Se risulta "Management",
 *   si usa l'altro reparto della persona (preferendo "Ottici"): i manager contano come Ottici o
 *   Addetti vendita (§1). Quindi un manager che è anche ottico conta come ottico, a meno che il turno
 *   non indichi esplicitamente "Addetti vendita".
 */
import { DEPARTMENT_NAMES } from "@/lib/domain/types";
import type { DepartmentRef, ISODate, PersonInput, ShiftInput, Zone } from "@/lib/domain/types";
import { fromMinutes, toMinutes, type MinuteRange } from "@/lib/domain/time";
import { shiftNetHours } from "@/lib/hours";
import {
  hourCellValue,
  segmentsToSlots,
  SLOT_FIRST_HOUR,
  SLOT_LAST_HOUR,
} from "@/lib/shifts/slots";

/** Id del reparto con quel nome (senza distinzione di maiuscole), o null. */
export function findDepartmentId(departments: DepartmentRef[], name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return departments.find((d) => d.name.trim().toLowerCase() === wanted)?.id ?? null;
}

/**
 * Reparto in cui la persona lavora nel turno.
 * `raw` = reparto indicato sul turno o principale; `effective` = come conta in copertura
 * (Management → l'altro reparto della persona, preferendo Ottici).
 */
export function workingDepartment(
  shift: Pick<ShiftInput, "departmentId">,
  person: Pick<PersonInput, "primaryDepartmentId" | "departmentIds"> | undefined,
  departments: DepartmentRef[],
): { raw: string | null; effective: string | null } {
  const raw = shift.departmentId ?? person?.primaryDepartmentId ?? null;
  const managementId = findDepartmentId(departments, DEPARTMENT_NAMES.management);
  if (raw === null || raw !== managementId || !person) return { raw, effective: raw };
  const others = person.departmentIds.filter((d) => d !== managementId);
  const otticiId = findDepartmentId(departments, DEPARTMENT_NAMES.ottici);
  const effective = otticiId && others.includes(otticiId) ? otticiId : (others[0] ?? raw);
  return { raw, effective };
}

/** Area di un turno: quella indicata, altrimenti l'area di base (null per i jolly). */
export function shiftZone(
  shift: Pick<ShiftInput, "zone">,
  person: Pick<PersonInput, "homeZone"> | undefined,
): Zone | null {
  if (shift.zone) return shift.zone;
  return person && person.homeZone !== "jolly" ? person.homeZone : null;
}

/** Una persona presente in una fascia. */
export type PresenceEntry = {
  profileId: string;
  /** true se in vendita (forza vendita), false se solo in back office. */
  sale: boolean;
  zone: Zone | null;
  departmentId: string | null;
  effectiveDepartmentId: string | null;
};

/**
 * Chi è presente in `range` tra i turni dati (già filtrati sul giorno).
 * Ogni persona compare una sola volta; il turno di vendita prevale su quello di back office.
 */
export function presenceIn(
  range: MinuteRange,
  dayShifts: ShiftInput[],
  peopleById: Map<string, PersonInput>,
  departments: DepartmentRef[],
): PresenceEntry[] {
  const byPerson = new Map<string, PresenceEntry>();
  for (const s of dayShifts) {
    if (toMinutes(s.start) > range.start || toMinutes(s.end) < range.end) continue;
    const prev = byPerson.get(s.profileId);
    const sale = !s.backOffice;
    if (prev && (prev.sale || !sale)) continue;
    const person = peopleById.get(s.profileId);
    const dep = workingDepartment(s, person, departments);
    byPerson.set(s.profileId, {
      profileId: s.profileId,
      sale,
      zone: shiftZone(s, person),
      departmentId: dep.raw,
      effectiveDepartmentId: dep.effective,
    });
  }
  return [...byPerson.values()];
}

export type CoverageSlot = {
  start: string;
  end: string;
  /** Tutte le persone presenti, back office compreso. */
  teste: number;
  /** Forza vendita: presenti non in back office. */
  delta: number;
  vista: number;
  sole: number;
  /** Ottici in vendita. */
  ottici: number;
  /** COP. OTT.: almeno un ottico in vendita. */
  copOtt: boolean;
  /** Persone presenti solo in back office (= teste − delta). */
  backOffice: number;
};

export type CoverageInput = {
  date: ISODate;
  shifts: ShiftInput[];
  people: PersonInput[];
  departments: DepartmentRef[];
  slotMinutes?: number;
  from?: string;
  to?: string;
};

/** Indicatori per ogni fascia del giorno (default: mezz'ore dalle 07:00 alle 22:00). */
export function computeCoverage({
  date,
  shifts,
  people,
  departments,
  slotMinutes = 30,
  from = "07:00",
  to = "22:00",
}: CoverageInput): CoverageSlot[] {
  const dayShifts = shifts.filter((s) => s.date === date);
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const otticiId = findDepartmentId(departments, DEPARTMENT_NAMES.ottici);
  const out: CoverageSlot[] = [];
  const end = toMinutes(to);
  for (let m = toMinutes(from); m + slotMinutes <= end; m += slotMinutes) {
    const present = presenceIn(
      { start: m, end: m + slotMinutes },
      dayShifts,
      peopleById,
      departments,
    );
    const sale = present.filter((p) => p.sale);
    const ottici = sale.filter(
      (p) => otticiId !== null && p.effectiveDepartmentId === otticiId,
    ).length;
    out.push({
      start: fromMinutes(m),
      end: fromMinutes(m + slotMinutes),
      teste: present.length,
      delta: sale.length,
      vista: sale.filter((p) => p.zone === "vista").length,
      sole: sale.filter((p) => p.zone === "sole").length,
      ottici,
      copOtt: ottici >= 1,
      backOffice: present.length - sale.length,
    });
  }
  return out;
}

/** Riga TOT: ore nette del giorno per persona e totale del negozio (es. 78). */
export function dailyTotals(
  date: ISODate,
  shifts: ShiftInput[],
): { byPerson: Record<string, number>; total: number } {
  const byPerson: Record<string, number> = {};
  let total = 0;
  for (const s of shifts) {
    if (s.date !== date) continue;
    const h = shiftNetHours(s);
    byPerson[s.profileId] = (byPerson[s.profileId] ?? 0) + h;
    total += h;
  }
  return { byPerson, total };
}

/**
 * Celle ORA di una persona in un giorno, come nel PDF: per ogni ora 07–21 il valore 1, 0,5 o 0
 * (somma delle due mezze celle dipinte). La somma dei valori dà le ore "dipinte" (senza pause).
 */
export function personHourCells(
  shifts: ShiftInput[],
  profileId: string,
  date: ISODate,
): { hour: number; value: 0 | 0.5 | 1 }[] {
  const slots = segmentsToSlots(shifts.filter((s) => s.profileId === profileId && s.date === date));
  const out: { hour: number; value: 0 | 0.5 | 1 }[] = [];
  for (let hour = SLOT_FIRST_HOUR; hour < SLOT_LAST_HOUR; hour++) {
    out.push({ hour, value: hourCellValue(slots, hour) });
  }
  return out;
}

/**
 * Aggrega le fasce da 30' per ora intera (righe del PDF): per ogni ora il minimo di ciascun
 * indicatore nelle sue mezz'ore (prudente: un buco di mezz'ora resta visibile).
 */
export function coverageByHour(slots: CoverageSlot[]): CoverageSlot[] {
  const byHour = new Map<string, CoverageSlot[]>();
  for (const s of slots) {
    const key = s.start.slice(0, 2);
    byHour.set(key, [...(byHour.get(key) ?? []), s]);
  }
  return [...byHour.entries()].map(([hour, group]) => {
    const min = (k: "teste" | "delta" | "vista" | "sole" | "ottici" | "backOffice") =>
      Math.min(...group.map((g) => g[k]));
    return {
      start: `${hour}:00`,
      end: group[group.length - 1].end,
      teste: min("teste"),
      delta: min("delta"),
      vista: min("vista"),
      sole: min("sole"),
      ottici: min("ottici"),
      copOtt: group.every((g) => g.copOtt),
      backOffice: min("backOffice"),
    };
  });
}
