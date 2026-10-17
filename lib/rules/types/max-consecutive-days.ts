/** Tipo di regola `max_consecutive_days` (per persona). */
import { z } from "zod";
import { addDaysISO, formatDayShort } from "@/lib/domain/time";
import type { ISODate } from "@/lib/domain/types";
import {
  allKnownShifts,
  baseViolation,
  describeNumber,
  describeValidity,
  formatNumber,
  numberParamSchema,
  resolveNumber,
  ruleAppliesOn,
} from "../common";
import type { RuleTypeDefinition, Violation } from "../types";

export const maxConsecutiveParams = z.object({ days: numberParamSchema });
export type MaxConsecutiveParams = z.infer<typeof maxConsecutiveParams>;

/**
 * Giorni lavorati di fila, contando anche la settimana precedente. La violazione si segnala una
 * volta per serie, nel primo giorno (della settimana) che supera il massimo.
 */
export const maxConsecutiveDays: RuleTypeDefinition<MaxConsecutiveParams> = {
  type: "max_consecutive_days",
  label: "Giorni consecutivi",
  description: "Numero massimo di giorni lavorati di fila.",
  paramsSchema: maxConsecutiveParams,
  defaultParams: { days: 6 },
  fields: [
    { key: "days", label: "Massimo giorni", kind: "number", unit: "giorni", allowVariable: true },
  ],
  describe(rule, p, { variables }) {
    return `Al massimo ${describeNumber(p.days, variables, ["giorno", "giorni"])} di lavoro di fila${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    const max = resolveNumber(p.days, ctx.variables);
    const worked = new Map<string, Set<ISODate>>();
    for (const s of allKnownShifts(ctx)) {
      if (!worked.has(s.profileId)) worked.set(s.profileId, new Set());
      worked.get(s.profileId)!.add(s.date);
    }
    const out: Violation[] = [];
    for (const person of ctx.people) {
      const dates = worked.get(person.id);
      if (!dates) continue;
      ctx.days.forEach((date, i) => {
        if (!dates.has(date) || !ruleAppliesOn(rule, date)) return;
        let streak = 0;
        for (let d = date; dates.has(d); d = addDaysISO(d, -1)) streak++;
        if (streak <= max) return;
        if (i > 0 && streak - 1 > max) return; // già segnalata il giorno prima
        out.push({
          ...baseViolation(rule),
          date,
          profileId: person.id,
          actual: streak,
          expected: max,
          message: `${formatDayShort(date)} · ${person.displayName}: ${streak} giorni lavorati di fila (massimo ${formatNumber(max)}) · regola '${rule.name}'`,
        });
      });
    }
    return out;
  },
};
