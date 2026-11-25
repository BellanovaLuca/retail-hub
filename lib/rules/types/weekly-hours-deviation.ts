/**
 * `weekly_hours_deviation`: le ore pianificate nella settimana devono stare entro ± pct% delle ore
 * di contratto. Una per persona (senza data).
 *
 * Ferie, permessi e malattia in `leaves` contano come ore "coperte" (con `countLeaves`, default
 * sì): una giornata parziale vale le sue ore, una giornata intera vale ore di contratto ÷
 * `workDaysPerWeek` (default 5: 40h → 8h), come i festivi a negozio chiuso. Si contano solo i
 * giorni senza turni e al massimo i giorni lavorativi rimasti; giorni liberi e indisponibilità
 * (assenze "altro") sono riposi e non valgono ore.
 * Chi non ha ore di contratto è ignorato. Il filtro giorni/periodo decide solo se la regola vale
 * nella settimana (basta un giorno applicabile); le fasce orarie non si applicano.
 */
import { z } from "zod";
import { personWeekHours } from "@/lib/hours";
import {
  baseViolation,
  describeNumber,
  describeValidity,
  formatNumber,
  numberParamSchema,
  openingFor,
  resolveNumber,
  ruleAppliesToWeek,
} from "../common";
import type { RuleContext, RuleTypeDefinition, Violation } from "../types";

export const weeklyHoursDeviationParams = z.object({
  pct: numberParamSchema,
  countLeaves: z.boolean().default(true),
  workDaysPerWeek: z.number().int().min(1).max(7).default(5),
});
export type WeeklyHoursDeviationParams = z.infer<typeof weeklyHoursDeviationParams>;

const EPS = 1e-9;

/** Assenze che valgono come ore coperte: giorni liberi e indisponibilità sono riposi, non ore. */
const PAID_LEAVE_TYPES = new Set(["ferie", "permesso", "malattia"]);

/**
 * Ore "coperte" da assenze e festivi nella settimana di una persona.
 * - Giornate intere di ferie/permesso/malattia e festivi a negozio chiuso: ore di contratto ÷
 *   `workDaysPerWeek` l'una, solo nei giorni senza turni (niente doppio conteggio) e al massimo
 *   per i giorni lavorativi rimasti (una settimana intera di ferie, domenica compresa, vale il
 *   contratto e non di più). Un'assenza copre ore mancanti, non ne aggiunge: chi ha già le ore
 *   di contratto in meno giorni (4 × 10h) non sale a 48 per un festivo o una ferie nel riposo.
 * - Assenze a ore (es. PE4): le loro ore.
 */
function coveredHours(
  ctx: RuleContext,
  profileId: string,
  contract: number,
  planned: number,
  p: WeeklyHoursDeviationParams,
): number {
  const worked = new Set(ctx.shifts.filter((s) => s.profileId === profileId).map((s) => s.date));
  const mine = ctx.leaves.filter(
    (l) => l.profileId === profileId && ctx.days.includes(l.date) && PAID_LEAVE_TYPES.has(l.type),
  );
  const partialDays = new Set(mine.filter((l) => l.hours != null).map((l) => l.date));
  const partialHours = mine.reduce((sum, l) => sum + (l.hours ?? 0), 0);
  const fullDays = new Set(mine.filter((l) => l.hours == null).map((l) => l.date));
  for (const date of ctx.days) {
    const closedHoliday =
      ctx.holidays.some((h) => h.date === date && h.storeClosed) && !openingFor(ctx, date);
    if (closedHoliday) fullDays.add(date);
  }
  const occupied = new Set(ctx.days.filter((d) => worked.has(d) || partialDays.has(d)));
  const free = [...fullDays].filter((d) => !occupied.has(d)).length;
  const covered = Math.min(free, Math.max(0, p.workDaysPerWeek - occupied.size));
  const missing = Math.max(0, contract - planned - partialHours);
  return partialHours + Math.min((covered * contract) / p.workDaysPerWeek, missing);
}

export const weeklyHoursDeviation: RuleTypeDefinition<WeeklyHoursDeviationParams> = {
  type: "weekly_hours_deviation",
  label: "Ore di contratto",
  description:
    "Le ore pianificate nella settimana restano entro una percentuale dalle ore di contratto.",
  paramsSchema: weeklyHoursDeviationParams,
  defaultParams: { pct: 10, countLeaves: true, workDaysPerWeek: 5 },
  fields: [
    { key: "pct", label: "Scostamento ammesso", kind: "number", unit: "%", allowVariable: true },
    { key: "countLeaves", label: "Conta ferie e permessi come ore coperte", kind: "boolean" },
    {
      key: "workDaysPerWeek",
      label: "Giorni lavorativi a settimana",
      kind: "number",
      unit: "giorni",
    },
  ],
  describe(rule, p, { variables }) {
    return `Ore pianificate entro ±${describeNumber(p.pct, variables, "%")} delle ore di contratto${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    if (!ruleAppliesToWeek(rule, ctx.days)) return [];
    const pct = resolveNumber(p.pct, ctx.variables);
    const out: Violation[] = [];
    for (const person of ctx.people) {
      const contract = person.weeklyHours;
      if (contract == null || contract <= 0) continue;
      const planned = personWeekHours(ctx.shifts, person.id, ctx.days);
      const leaveHours = p.countLeaves ? coveredHours(ctx, person.id, contract, planned, p) : 0;
      const actual = Math.round((planned + leaveHours) * 100) / 100;
      const low = contract * (1 - pct / 100);
      const high = contract * (1 + pct / 100);
      if (actual >= low - EPS && actual <= high + EPS) continue;
      const leaves = leaveHours > 0 ? ` (assenze comprese)` : "";
      out.push({
        ...baseViolation(rule),
        profileId: person.id,
        actual,
        expected: contract,
        message: `${person.displayName}: ${formatNumber(actual)} ore su ${formatNumber(contract)}${leaves}, fuori dal ±${formatNumber(pct)}% · regola '${rule.name}'`,
      });
    }
    return out;
  },
};
