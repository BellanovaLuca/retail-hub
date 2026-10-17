/**
 * Fixture "Week 39": una settimana realistica del negozio (lun 21 – dom 27 settembre 2026),
 * 20 persone con nomi inventati (tre Francesca con nomi visualizzati diversi).
 *
 * - Apertura lun–sab 10:00–20:00, dom 10:30–20:00.
 * - Manager con il turno MAN 10–20 (pausa di 60' senza posizione).
 * - Paola (Management) apre il back office 08:30–10:00 lun–ven, poi passa in vendita; il sabato
 *   apre Elena (Management, Sole).
 * - Jolly che cambiano area da un giorno all'altro (Alessio: lun Vista, mar Sole…).
 * - Turni spezzati come nel foglio orario (A = 10–13 · 14–19, C = 11–13 · 14–20).
 * - Luca in ferie mercoledì.
 * - Buchi voluti: mercoledì 19:00–20:00 nessun ottico; giovedì 19:00–20:00 una sola persona in Sole.
 */
import { weekDays, toISODate } from "@/lib/dates";
import type {
  DepartmentRef,
  ISODate,
  LeaveInput,
  OpeningHours,
  PersonInput,
  ShiftInput,
  Zone,
} from "@/lib/domain/types";
import type { RuleContext, RuleRecord, Variables } from "@/lib/rules/types";
import { STANDARD_RULE_SET, resolveSeedRules } from "@/lib/rules/seed";

export const WEEK39_START: ISODate = "2026-09-21";
export const WEEK39_DAYS: ISODate[] = weekDays(new Date(2026, 8, 23)).map(toISODate);
export const [MON, TUE, WED, THU, FRI, SAT, SUN] = WEEK39_DAYS;

export const DEPARTMENTS: DepartmentRef[] = [
  { id: "dep-man", name: "Management" },
  { id: "dep-ott", name: "Ottici" },
  { id: "dep-adv", name: "Addetti vendita" },
];

export const OPENING_HOURS: OpeningHours = {
  1: { start: "10:00", end: "20:00" },
  2: { start: "10:00", end: "20:00" },
  3: { start: "10:00", end: "20:00" },
  4: { start: "10:00", end: "20:00" },
  5: { start: "10:00", end: "20:00" },
  6: { start: "10:00", end: "20:00" },
  7: { start: "10:30", end: "20:00" },
};

const person = (
  id: string,
  displayName: string,
  weeklyHours: number,
  homeZone: PersonInput["homeZone"],
  departmentIds: string[],
): PersonInput => ({
  id,
  displayName,
  weeklyHours,
  homeZone,
  departmentIds,
  primaryDepartmentId: departmentIds[0],
});

export const PEOPLE: PersonInput[] = [
  // Management (reparto principale) — contano come Ottici o Addetti vendita
  person("marco", "Marco", 40, "vista", ["dep-man", "dep-ott"]),
  person("paola", "Paola", 40, "vista", ["dep-man", "dep-adv"]),
  person("elena", "Elena", 40, "sole", ["dep-man", "dep-adv"]),
  // Ottici
  person("francesca", "Francesca", 40, "vista", ["dep-ott"]),
  person("davide", "Davide", 40, "vista", ["dep-ott"]),
  person("giorgio", "Giorgio", 30, "vista", ["dep-ott"]),
  person("sara", "Sara", 24, "vista", ["dep-ott"]),
  // Addetti vendita · Vista
  person("francy", "Francy", 40, "vista", ["dep-adv"]),
  person("luca", "Luca", 40, "vista", ["dep-adv"]),
  person("anna", "Anna", 30, "vista", ["dep-adv"]),
  person("chiara", "Chiara", 20, "vista", ["dep-adv"]),
  // Addetti vendita · Sole
  person("fra-d", "Fra D.", 40, "sole", ["dep-adv"]),
  person("giulia", "Giulia", 40, "sole", ["dep-adv"]),
  person("irene", "Irene", 40, "sole", ["dep-adv"]),
  person("matteo", "Matteo", 30, "sole", ["dep-adv"]),
  person("simone", "Simone", 24, "sole", ["dep-adv"]),
  person("nicola", "Nicola", 20, "sole", ["dep-adv"]),
  // Jolly
  person("alessio", "Alessio", 40, "jolly", ["dep-adv"]),
  person("valentina", "Valentina", 30, "jolly", ["dep-adv"]),
  person("roberto", "Roberto", 24, "jolly", ["dep-adv"]),
];

type Piece = [start: string, end: string, opts?: { breakMinutes?: number; backOffice?: boolean }];

/** Turni usati nella settimana (pezzi di turno come righe di `shifts`). */
export const CODES: Record<string, Piece[]> = {
  MAN: [["10:00", "20:00", { breakMinutes: 60 }]], // 9 h
  MC: [["10:00", "14:00"]], // 4 h
  A: [
    ["10:00", "13:00"],
    ["14:00", "19:00"],
  ], // 8 h
  C: [
    ["11:00", "13:00"],
    ["14:00", "20:00"],
  ], // 8 h
  AD: [
    ["10:30", "13:00"],
    ["14:00", "19:30"],
  ], // 8 h, domenica
  P: [["14:00", "20:00"]], // 6 h
  Q: [
    ["11:00", "13:00"],
    ["14:00", "18:00"],
  ], // 6 h
  S: [["16:00", "20:00"]], // 4 h
  BO: [
    ["08:30", "10:00", { backOffice: true }],
    ["10:00", "13:00"],
    ["14:00", "17:30"],
  ], // 8 h, di cui 1,5 in back office
};

/**
 * Piano lun→dom. "R" = riposo, "F" = ferie, "A>sole" = turno A in Sole (per i jolly).
 * Marco lavora come Ottico (reparto indicato sul turno).
 */
export const PLAN: Record<string, string[]> = {
  marco: ["MAN", "MAN", "R", "MAN", "MAN", "MC", "R"],
  paola: ["BO", "BO", "BO", "BO", "BO", "R", "R"],
  elena: ["MAN", "MAN", "MAN", "R", "MC", "BO", "R"],
  francesca: ["A", "A", "A", "R", "A", "C", "R"],
  davide: ["C", "R", "A", "C", "R", "A", "AD"],
  giorgio: ["R", "P", "R", "P", "P", "P", "P"],
  sara: ["P", "R", "R", "R", "P", "P", "P"],
  francy: ["A", "C", "C", "A", "R", "C", "R"],
  luca: ["C", "A", "F", "C", "A", "R", "R"],
  anna: ["R", "P", "P", "R", "P", "P", "P"],
  chiara: ["S", "R", "S", "S", "R", "S", "S"],
  "fra-d": ["A", "C", "R", "A", "C", "C", "R"],
  giulia: ["C", "A", "C", "A", "A", "R", "R"],
  irene: ["R", "R", "A", "C", "C", "A", "AD"],
  matteo: ["P", "P", "P", "R", "R", "P", "P"],
  simone: ["P", "R", "R", "R", "P", "P", "P"],
  nicola: ["R", "S", "S", "R", "S", "S", "S"],
  alessio: ["A>vista", "C>sole", "R", "A>vista", "R", "C>sole", "AD>sole"],
  valentina: ["R", "P>vista", "P>sole", "P>vista", "R", "P>sole", "Q>vista"],
  roberto: ["P>sole", "R", "R", "P>vista", "P>vista", "P>vista", "R"],
};

/** Espande un piano (persona → codici per giorno) in righe di turno. */
export function expandPlan(plan: Record<string, string[]>, days: ISODate[]): ShiftInput[] {
  const shifts: ShiftInput[] = [];
  for (const [profileId, codes] of Object.entries(plan)) {
    const p = PEOPLE.find((x) => x.id === profileId)!;
    codes.forEach((cell, i) => {
      const [code, zoneOverride] = cell.split(">") as [string, Zone | undefined];
      const pieces = CODES[code];
      if (!pieces) return; // R, F, vuoto
      for (const [start, end, opts] of pieces) {
        shifts.push({
          id: `${profileId}-${days[i]}-${start}`,
          profileId,
          date: days[i],
          start,
          end,
          breakMinutes: opts?.breakMinutes ?? 0,
          zone: zoneOverride ?? (p.homeZone === "jolly" ? null : p.homeZone),
          backOffice: opts?.backOffice ?? false,
          departmentId: profileId === "marco" ? "dep-ott" : null,
        });
      }
    });
  }
  return shifts;
}

export const SHIFTS: ShiftInput[] = expandPlan(PLAN, WEEK39_DAYS);

export const LEAVES: LeaveInput[] = [
  { profileId: "luca", date: WED, type: "ferie", hours: null, status: "confirmed" },
];

/** Domenica della settimana precedente: Davide chiude alle 20 e lunedì entra alle 11. */
export const PREVIOUS_WEEK_SHIFTS: ShiftInput[] = expandPlan({ davide: ["C"], giorgio: ["P"] }, [
  "2026-09-20",
]);

export const STANDARD_VARIABLES: Variables = Object.fromEntries(
  STANDARD_RULE_SET.variables.map((v) => [v.key, v.value]),
);

/** Regole del set "Standard" con id = nome (per test leggibili). */
export const STANDARD_RULES: RuleRecord[] = resolveSeedRules(STANDARD_RULE_SET, DEPARTMENTS).map(
  (r) => ({ ...r, id: r.name }),
);

/** Contesto delle regole per la Week 39, con eventuali sostituzioni. */
export function week39Context(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    weekStart: WEEK39_START,
    days: WEEK39_DAYS,
    shifts: SHIFTS,
    leaves: LEAVES,
    people: PEOPLE,
    departments: DEPARTMENTS,
    openingHours: OPENING_HOURS,
    holidays: [],
    variables: STANDARD_VARIABLES,
    previousWeekShifts: PREVIOUS_WEEK_SHIFTS,
    ...overrides,
  };
}
