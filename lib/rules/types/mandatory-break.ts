/** Tipo di regola `mandatory_break` (per persona). */
import { z } from "zod";
import { formatDayShort, fromMinutes, toMinutes } from "@/lib/domain/time";
import {
  baseViolation,
  describeDays,
  describeNumber,
  describeValidity,
  formatNumber,
  numberParamSchema,
  resolveNumber,
  ruleAppliesOn,
} from "../common";
import type { RuleTypeDefinition, Violation } from "../types";

export const mandatoryBreakParams = z.object({
  afterHours: numberParamSchema,
  minMinutes: numberParamSchema,
});
export type MandatoryBreakParams = z.infer<typeof mandatoryBreakParams>;

/**
 * Un tratto di lavoro continuo più lungo di `afterHours` ore deve avere almeno `minMinutes` di pausa.
 * Pause considerate: `breakMinutes` dei turni e vuoti tra i pezzi dello stesso giorno. Un vuoto
 * ≥ `minMinutes` spezza il tratto (è già una pausa sufficiente); i vuoti più brevi e le pause dei turni
 * del tratto si sommano. La durata del tratto è il tempo lavorato (fine − inizio − pause).
 */
export const mandatoryBreak: RuleTypeDefinition<MandatoryBreakParams> = {
  type: "mandatory_break",
  label: "Pausa obbligatoria",
  description: "Pausa minima per chi lavora più di un certo numero di ore di fila.",
  paramsSchema: mandatoryBreakParams,
  defaultParams: { afterHours: 6, minMinutes: 30 },
  fields: [
    {
      key: "afterHours",
      label: "Dopo quante ore",
      kind: "number",
      unit: "ore",
      allowVariable: true,
    },
    { key: "minMinutes", label: "Pausa minima", kind: "number", unit: "min", allowVariable: true },
  ],
  describe(rule, p, { variables }) {
    return `Pausa di almeno ${describeNumber(p.minMinutes, variables, ["minuto", "minuti"])} dopo ${describeNumber(p.afterHours, variables, ["ora", "ore"])} di lavoro · ${describeDays(rule.days)}${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    const afterMinutes = resolveNumber(p.afterHours, ctx.variables) * 60;
    const minBreak = resolveNumber(p.minMinutes, ctx.variables);
    const out: Violation[] = [];
    for (const person of ctx.people) {
      for (const date of ctx.days) {
        if (!ruleAppliesOn(rule, date)) continue;
        const pieces = ctx.shifts
          .filter((s) => s.profileId === person.id && s.date === date)
          .map((s) => ({ start: toMinutes(s.start), end: toMinutes(s.end), pause: s.breakMinutes }))
          .sort((a, b) => a.start - b.start);
        const blocks: { start: number; end: number; pause: number }[] = [];
        for (const piece of pieces) {
          const last = blocks[blocks.length - 1];
          const gap = last ? piece.start - last.end : Infinity;
          if (last && gap < minBreak) {
            last.pause += Math.max(0, gap) + piece.pause;
            last.end = Math.max(last.end, piece.end);
          } else {
            blocks.push({ ...piece });
          }
        }
        for (const b of blocks) {
          const worked = b.end - b.start - b.pause;
          if (worked <= afterMinutes || b.pause >= minBreak) continue;
          out.push({
            ...baseViolation(rule),
            date,
            start: fromMinutes(b.start),
            end: fromMinutes(b.end),
            profileId: person.id,
            actual: b.pause,
            expected: minBreak,
            message: `${formatDayShort(date)} · ${fromMinutes(b.start)}–${fromMinutes(b.end)} · ${person.displayName}: ${formatNumber(worked / 60)} ore di fila con ${formatNumber(b.pause)}' di pausa (minimo ${formatNumber(minBreak)}') · regola '${rule.name}'`,
          });
        }
      }
    }
    return out;
  },
};
