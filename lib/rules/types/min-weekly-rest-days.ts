/** Tipo di regola `min_weekly_rest_days` (per persona). */
import { z } from "zod";
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

export const minWeeklyRestParams = z.object({ days: numberParamSchema });
export type MinWeeklyRestParams = z.infer<typeof minWeeklyRestParams>;

/**
 * Giorni senza turni nella settimana. Contano come riposo anche i giorni di ferie o assenza
 * e le festività a negozio chiuso (sono comunque giorni non lavorati).
 * Chi non ha alcun turno nella settimana non viene segnalato.
 */
export const minWeeklyRestDays: RuleTypeDefinition<MinWeeklyRestParams> = {
  type: "min_weekly_rest_days",
  label: "Riposi settimanali",
  description: "Numero minimo di giorni senza turni nella settimana.",
  paramsSchema: minWeeklyRestParams,
  defaultParams: { days: 1 },
  fields: [
    { key: "days", label: "Minimo giorni", kind: "number", unit: "giorni", allowVariable: true },
  ],
  describe(rule, p, { variables }) {
    return `Almeno ${describeNumber(p.days, variables, ["giorno", "giorni"])} di riposo a settimana${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    if (!ruleAppliesToWeek(rule, ctx.days)) return [];
    const min = resolveNumber(p.days, ctx.variables);
    const out: Violation[] = [];
    for (const person of ctx.people) {
      const worked = new Set(
        ctx.shifts.filter((s) => s.profileId === person.id).map((s) => s.date),
      );
      const workedDays = ctx.days.filter((d) => worked.has(d)).length;
      if (workedDays === 0) continue;
      const rest = ctx.days.length - workedDays;
      if (rest >= min) continue;
      out.push({
        ...baseViolation(rule),
        profileId: person.id,
        actual: rest,
        expected: min,
        message: `${person.displayName}: ${rest} giorni di riposo nella settimana (minimo ${formatNumber(min)}) · regola '${rule.name}'`,
      });
    }
    return out;
  },
};
