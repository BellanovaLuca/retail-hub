/**
 * `weekly_hours_deviation`: le ore pianificate nella settimana devono stare entro ± pct% delle ore
 * di contratto. Una per persona (senza data).
 *
 * Le assenze in `leaves` contano come ore "coperte" (con `countLeaves`, default sì): una giornata
 * parziale vale le sue ore, una giornata intera vale ore di contratto ÷ `workDaysPerWeek`
 * (default 5: 40h → 8h). Così chi ha un giorno di ferie non viene segnalato.
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
  resolveNumber,
  ruleAppliesToWeek,
} from "../common";
import type { RuleTypeDefinition, Violation } from "../types";

export const weeklyHoursDeviationParams = z.object({
  pct: numberParamSchema,
  countLeaves: z.boolean().default(true),
  workDaysPerWeek: z.number().int().min(1).max(7).default(5),
});
export type WeeklyHoursDeviationParams = z.infer<typeof weeklyHoursDeviationParams>;

const EPS = 1e-9;

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
    const days = new Set(ctx.days);
    const out: Violation[] = [];
    for (const person of ctx.people) {
      const contract = person.weeklyHours;
      if (contract == null || contract <= 0) continue;
      const planned = personWeekHours(ctx.shifts, person.id, ctx.days);
      const leaveHours = p.countLeaves
        ? ctx.leaves
            .filter((l) => l.profileId === person.id && days.has(l.date))
            .reduce((sum, l) => sum + (l.hours ?? contract / p.workDaysPerWeek), 0)
        : 0;
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
