/**
 * Mattoni condivisi dai tipi di regola: schemi zod comuni, variabili, giorni e fasce di validità,
 * conteggio delle presenze e unione delle violazioni contigue.
 */
import { z } from "zod";
import { presenceIn, type PresenceEntry } from "@/lib/coverage";
import {
  formatDateIT,
  formatDayShort,
  fromMinutes,
  intersectRange,
  mergeRanges,
  toMinutes,
  toRange,
  weekdayOf,
  WEEKDAY_SHORT,
  type MinuteRange,
} from "@/lib/domain/time";
import type { DepartmentRef, ISODate, PersonInput, ShiftInput } from "@/lib/domain/types";
import type { NumberParam, RuleContext, RuleRecord, Variables, Violation } from "./types";

/* ------------------------------------------------------------------ schemi */

export const numberParamSchema = z.union([
  z.number().finite(),
  z.object({ var: z.string().trim().min(1, "Nome di variabile mancante") }),
]);

export const zoneScopeSchema = z.object({
  kind: z.literal("zone"),
  zone: z.enum(["vista", "sole"]),
});
export const departmentScopeSchema = z.object({
  kind: z.literal("department"),
  departmentId: z.string().min(1, "Reparto mancante"),
});
export const allScopeSchema = z.object({ kind: z.literal("all") });

export const scopeSchema = z.discriminatedUnion("kind", [
  zoneScopeSchema,
  departmentScopeSchema,
  allScopeSchema,
]);
export type Scope = z.infer<typeof scopeSchema>;

/** Ambito ristretto a reparto o tutti (per le regole sulle ferie). */
export const peopleScopeSchema = z.discriminatedUnion("kind", [
  departmentScopeSchema,
  allScopeSchema,
]);
export type PeopleScope = z.infer<typeof peopleScopeSchema>;

/* -------------------------------------------------------------- variabili */

/** Errore di configurazione di una regola (es. variabile inesistente): diventa un avviso "info". */
export class RuleConfigError extends Error {}

/** Valore di un parametro numerico: il numero, oppure il valore della variabile richiamata. */
export function resolveNumber(param: NumberParam, variables: Variables): number {
  if (typeof param === "number") return param;
  const value = variables[param.var];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RuleConfigError(`la variabile "${param.var}" non esiste`);
  }
  return value;
}

/**
 * Quantità per le descrizioni: "2 persone", "1 persona (min_sole_apertura)", "10% (tolleranza_ore)".
 * `unit` è una stringa fissa o la coppia [singolare, plurale]; "%" e "'" si attaccano al numero.
 */
export function describeNumber(
  param: NumberParam,
  variables: Variables,
  unit: string | [one: string, many: string] = "",
): string {
  const value = typeof param === "number" ? param : variables[param.var];
  const suffix = typeof param === "number" ? "" : ` (${param.var})`;
  if (typeof value !== "number") return `{${(param as { var: string }).var}}`;
  const u = Array.isArray(unit) ? plural(value, unit[0], unit[1]) : unit;
  const glue = u === "" || /^[%']/.test(u) ? "" : " ";
  return `${formatNumber(value)}${glue}${u}${suffix}`;
}

export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/* ----------------------------------------------------- giorni e validità */

/** La regola vale in quella data (giorni della settimana e periodo dal/al)? */
export function ruleAppliesOn(rule: RuleRecord, date: ISODate): boolean {
  if (rule.days.length > 0 && !rule.days.includes(weekdayOf(date))) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validTo && date > rule.validTo) return false;
  return true;
}

/** Per le regole settimanali: vale se almeno un giorno della settimana è applicabile. */
export function ruleAppliesToWeek(rule: RuleRecord, days: ISODate[]): boolean {
  return days.some((d) => ruleAppliesOn(rule, d));
}

/** Orario di apertura effettivo del giorno: eccezioni, festività a negozio chiuso, orario standard. */
export function openingFor(ctx: RuleContext, date: ISODate): MinuteRange | null {
  if (ctx.openingExceptions && date in ctx.openingExceptions) {
    const exc = ctx.openingExceptions[date];
    return exc ? toRange(exc) : null;
  }
  if (ctx.holidays.some((h) => h.date === date && h.storeClosed)) return null;
  const hours = ctx.openingHours[weekdayOf(date)];
  return hours ? toRange(hours) : null;
}

/**
 * Fasce in cui controllare una regola di presenza in un giorno.
 * Negozio chiuso → nessuna fascia. Con `clipToOpening` le fasce della regola sono intersecate con
 * l'orario di apertura (senza fasce = tutto l'orario); senza, valgono così come sono
 * (senza fasce = tutta la giornata).
 */
export function presenceWindows(
  ctx: RuleContext,
  rule: RuleRecord,
  date: ISODate,
  clipToOpening = true,
): MinuteRange[] {
  const opening = openingFor(ctx, date);
  if (!opening) return [];
  const windows = rule.timeWindows.map(toRange);
  if (!clipToOpening) return mergeRanges(windows.length ? windows : [{ start: 0, end: 1440 }]);
  if (windows.length === 0) return [opening];
  return mergeRanges(
    windows.map((w) => intersectRange(w, opening)).filter((w): w is MinuteRange => w !== null),
  );
}

/* --------------------------------------------------------------- presenze */

export type PresenceMode = "sale" | "all" | "backOffice";

export function matchesScope(entry: PresenceEntry, scope: Scope): boolean {
  switch (scope.kind) {
    case "zone":
      return entry.zone === scope.zone;
    case "department":
      return (
        entry.departmentId === scope.departmentId ||
        entry.effectiveDepartmentId === scope.departmentId
      );
    case "all":
      return true;
  }
}

/** Prepara un contatore di presenze per un giorno. */
export function presenceCounter(ctx: RuleContext, date: ISODate) {
  const dayShifts = ctx.shifts.filter((s) => s.date === date);
  const peopleById = new Map(ctx.people.map((p) => [p.id, p]));
  return (range: MinuteRange, scope: Scope, mode: PresenceMode): number =>
    presenceIn(range, dayShifts, peopleById, ctx.departments).filter(
      (e) => (mode === "all" || (mode === "sale" ? e.sale : !e.sale)) && matchesScope(e, scope),
    ).length;
}

/** Passo di controllo delle regole di presenza (quarti d'ora, come il parser dei turni). */
export const PRESENCE_STEP_MINUTES = 15;

/**
 * Scorre le fasce a passi di 15' e produce le violazioni, unendo quelle contigue
 * (stessa regola e giorno) in un'unica violazione con la fascia complessiva e il valore peggiore
 * (`worst = "min"` per i minimi, `"max"` per i massimi).
 */
export function scanPresence(opts: {
  rule: RuleRecord;
  date: ISODate;
  windows: MinuteRange[];
  count: (range: MinuteRange) => number;
  violates: (actual: number) => boolean;
  expected: number;
  worst: "min" | "max";
  label: string;
}): Violation[] {
  const { rule, date, windows, count, violates, expected, worst, label } = opts;
  const runs: { start: number; end: number; actual: number }[] = [];
  for (const w of windows) {
    for (let m = w.start; m < w.end; m += PRESENCE_STEP_MINUTES) {
      const range = { start: m, end: Math.min(m + PRESENCE_STEP_MINUTES, w.end) };
      const actual = count(range);
      if (!violates(actual)) continue;
      const last = runs[runs.length - 1];
      if (last && last.end === range.start) {
        last.end = range.end;
        last.actual =
          worst === "min" ? Math.min(last.actual, actual) : Math.max(last.actual, actual);
      } else {
        runs.push({ ...range, actual });
      }
    }
  }
  return runs.map((r) => ({
    ...baseViolation(rule),
    date,
    start: fromMinutes(r.start),
    end: fromMinutes(r.end),
    actual: r.actual,
    expected,
    message: `${formatDayShort(date)} · ${fromMinutes(r.start)}–${fromMinutes(r.end)} · ${label}: ${formatNumber(r.actual)}/${formatNumber(expected)} · regola '${rule.name}'`,
  }));
}

export function baseViolation(rule: RuleRecord) {
  return { ruleId: rule.id, ruleName: rule.name, ruleType: rule.type, severity: rule.severity };
}

/* ------------------------------------------------------------- etichette */

export function scopeLabel(scope: Scope, departments: DepartmentRef[]): string {
  switch (scope.kind) {
    case "zone":
      return scope.zone === "vista" ? "Vista" : "Sole";
    case "department":
      return departments.find((d) => d.id === scope.departmentId)?.name ?? "Reparto sconosciuto";
    case "all":
      return "Presenti";
  }
}

export function personName(people: PersonInput[], profileId: string): string {
  return people.find((p) => p.id === profileId)?.displayName ?? profileId;
}

/** "lun–dom", "lun–sab", "sab", "lun, mer, ven". */
export function describeDays(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.length === 7) return "lun–dom";
  const groups: number[][] = [];
  for (const d of sorted) {
    const g = groups[groups.length - 1];
    if (g && g[g.length - 1] === d - 1) g.push(d);
    else groups.push([d]);
  }
  return groups
    .map((g) =>
      g.length >= 3
        ? `${WEEKDAY_SHORT[g[0] - 1]}–${WEEKDAY_SHORT[g[g.length - 1] - 1]}`
        : g.map((d) => WEEKDAY_SHORT[d - 1]).join(", "),
    )
    .join(", ");
}

/** "10:00–12:00, 14:00–19:00" oppure il testo di default. */
export function describeWindows(rule: RuleRecord, fallback = "orario di apertura"): string {
  if (rule.timeWindows.length === 0) return fallback;
  return rule.timeWindows
    .map((w) => `${fromMinutes(toMinutes(w.start))}–${fromMinutes(toMinutes(w.end))}`)
    .join(", ");
}

/** " · dal 01/12/2026 al 24/12/2026" se la regola è stagionale. */
export function describeValidity(rule: RuleRecord): string {
  if (rule.validFrom && rule.validTo)
    return ` · dal ${formatDateIT(rule.validFrom)} al ${formatDateIT(rule.validTo)}`;
  if (rule.validFrom) return ` · dal ${formatDateIT(rule.validFrom)}`;
  if (rule.validTo) return ` · fino al ${formatDateIT(rule.validTo)}`;
  return "";
}

/* ----------------------------------------------------- turni per persona */

/** Fasce lavorate da una persona in un giorno (in minuti), unendo i pezzi contigui. */
export function personDayRanges(
  shifts: ShiftInput[],
  profileId: string,
  date: ISODate,
): MinuteRange[] {
  return mergeRanges(
    shifts.filter((s) => s.profileId === profileId && s.date === date).map((s) => toRange(s)),
  );
}

/** Tutti i turni noti: settimana precedente + settimana corrente. */
export function allKnownShifts(ctx: RuleContext): ShiftInput[] {
  return [...(ctx.previousWeekShifts ?? []), ...ctx.shifts];
}
