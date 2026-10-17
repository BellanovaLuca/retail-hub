/** Tipo di regola `min_rest_between_shifts` (per persona). */
import { z } from "zod";
import { addDaysISO, formatDayShort, fromMinutes } from "@/lib/domain/time";
import {
  allKnownShifts,
  baseViolation,
  describeDays,
  describeNumber,
  describeValidity,
  formatNumber,
  numberParamSchema,
  personDayRanges,
  resolveNumber,
  ruleAppliesOn,
} from "../common";
import type { RuleTypeDefinition, Violation } from "../types";

export const minRestParams = z.object({ hours: numberParamSchema });
export type MinRestParams = z.infer<typeof minRestParams>;

/**
 * Ore di riposo tra la fine dell'ultimo turno di un giorno e l'inizio del primo turno del giorno
 * dopo (anche tra la domenica della settimana precedente e il lunedì). Con un giorno libero in mezzo
 * il riposo supera comunque le 24 ore, quindi si controllano solo giorni consecutivi.
 */
export const minRestBetweenShifts: RuleTypeDefinition<MinRestParams> = {
  type: "min_rest_between_shifts",
  label: "Riposo tra due turni",
  description: "Ore minime di riposo tra la fine di un turno e l'inizio del successivo.",
  paramsSchema: minRestParams,
  defaultParams: { hours: 11 },
  fields: [{ key: "hours", label: "Ore minime", kind: "number", unit: "ore", allowVariable: true }],
  describe(rule, p, { variables }) {
    return `Almeno ${describeNumber(p.hours, variables, ["ora", "ore"])} di riposo tra due turni · ${describeDays(rule.days)}${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    const minHours = resolveNumber(p.hours, ctx.variables);
    const shifts = allKnownShifts(ctx);
    const out: Violation[] = [];
    for (const person of ctx.people) {
      for (const date of ctx.days) {
        if (!ruleAppliesOn(rule, date)) continue;
        const today = personDayRanges(shifts, person.id, date);
        const yesterday = personDayRanges(shifts, person.id, addDaysISO(date, -1));
        if (today.length === 0 || yesterday.length === 0) continue;
        const restMinutes = 1440 - yesterday[yesterday.length - 1].end + today[0].start;
        const rest = restMinutes / 60;
        if (rest >= minHours) continue;
        out.push({
          ...baseViolation(rule),
          date,
          start: fromMinutes(today[0].start),
          profileId: person.id,
          actual: rest,
          expected: minHours,
          message: `${formatDayShort(date)} · ${person.displayName}: riposo di ${formatNumber(rest)} ore dal turno precedente (minimo ${formatNumber(minHours)}) · regola '${rule.name}'`,
        });
      }
    }
    return out;
  },
};
