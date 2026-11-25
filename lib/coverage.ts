/**
 * Indicatori di copertura per fascia (§7.1, §7.2): TESTE, DELTA, Vista, Sole, COP. OTT.
 *
 * Scelte documentate:
 * - Una persona è presente in una fascia se i suoi turni, uniti, coprono TUTTA la fascia
 *   (con fasce da 30' un turno 10:15–… conta dalla fascia 10:30–11:00; due pezzi contigui,
 *   es. back office fino alle 10:15 e vendita dalle 10:15, coprono la fascia 10:00–10:30).
 * - Le pause (`breakMinutes`) non hanno una posizione nella giornata, quindi NON riducono la
 *   presenza: riducono solo le ore. Per far "vedere" una pausa alle coperture, il turno va spezzato
 *   (es. 10–13 e 14–19, come nel foglio orario).
 * - Back office: conta nella forza vendita chi copre la fascia con i soli turni di vendita; chi la
 *   copre anche solo in parte in back office conta in TESTE ma non nella forza vendita.
 * - Area: quella del turno; se manca, l'area di base della persona (i jolly senza area non contano
 *   né in Vista né in Sole, ma contano in DELTA).
 * - Reparto (COP. OTT.): `shift.departmentId ?? persona.primaryDepartmentId`. Se risulta "Management",
 *   si usa l'altro reparto della persona (preferendo "Ottici"): i manager contano come Ottici o
 *   Addetti vendita (§1). Quindi un manager che è anche ottico conta come ottico, a meno che il turno
 *   non indichi esplicitamente "Addetti vendita".
 */
import { DEPARTMENT_NAMES } from "@/lib/domain/types";
import type { DepartmentRef, ISODate, PersonInput, ShiftInput, Zone } from "@/lib/domain/types";
import { fromMinutes, mergeRanges, toMinutes, type MinuteRange } from "@/lib/domain/time";
import { dayNetHours } from "@/lib/hours";
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
  const piecesBy = new Map<string, ShiftInput[]>();
  for (const s of dayShifts) {
    const list = piecesBy.get(s.profileId);
    if (list) list.push(s);
    else piecesBy.set(s.profileId, [s]);
  }
  const covers = (pieces: ShiftInput[]) =>
    mergeRanges(pieces.map((s) => ({ start: toMinutes(s.start), end: toMinutes(s.end) }))).some(
      (r) => r.start <= range.start && r.end >= range.end,
    );
  const out: PresenceEntry[] = [];
  for (const [profileId, pieces] of piecesBy) {
    // Presente se i suoi pezzi, uniti, coprono tutta la fascia (anche due pezzi contigui che si
    // danno il cambio a metà fascia); in vendita solo se la coprono i pezzi di vendita da soli.
    const salePieces = pieces.filter((s) => !s.backOffice);
    const sale = covers(salePieces);
    if (!sale && !covers(pieces)) continue;
    const touching = (sale ? salePieces : pieces)
      .filter((s) => toMinutes(s.start) < range.end && toMinutes(s.end) > range.start)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    // Area e reparto: quelli del pezzo in corso all'inizio della fascia.
    const s = touching[0];
    const person = peopleById.get(profileId);
    const dep = workingDepartment(s, person, departments);
    out.push({
      profileId,
      sale,
      zone: shiftZone(s, person),
      departmentId: dep.raw,
      effectiveDepartmentId: dep.effective,
    });
  }
  return out;
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
  const pieces: Record<string, ShiftInput[]> = {};
  for (const s of shifts) {
    if (s.date !== date) continue;
    (pieces[s.profileId] ??= []).push(s);
  }
  const byPerson: Record<string, number> = {};
  let total = 0;
  for (const [profileId, list] of Object.entries(pieces)) {
    byPerson[profileId] = dayNetHours(list);
    total += byPerson[profileId];
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
