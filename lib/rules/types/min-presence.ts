/** `min_presence`: almeno N persone dell'ambito in ogni fascia (es. "Sole ≥ 2 dalle 12 alle 20"). */
import { z } from "zod";
import {
  describeDays,
  describeNumber,
  describeValidity,
  describeWindows,
  numberParamSchema,
  presenceCounter,
  presenceWindows,
  resolveNumber,
  ruleAppliesOn,
  scanPresence,
  scopeLabel,
  scopeSchema,
} from "../common";
import type { RuleTypeDefinition, Violation } from "../types";

export const minPresenceParams = z.object({
  scope: scopeSchema,
  min: numberParamSchema,
  /** Conta anche chi è in back office (default: no, conta solo la forza vendita). */
  includeBackOffice: z.boolean().default(false),
});
export type MinPresenceParams = z.infer<typeof minPresenceParams>;

export const minPresence: RuleTypeDefinition<MinPresenceParams> = {
  type: "min_presence",
  label: "Presenza minima",
  description:
    "Almeno un certo numero di persone (per area, reparto o in totale) nelle fasce indicate.",
  paramsSchema: minPresenceParams,
  defaultParams: { scope: { kind: "all" }, min: 1, includeBackOffice: false },
  fields: [
    { key: "scope", label: "Ambito", kind: "scope", scopeKinds: ["zone", "department", "all"] },
    { key: "min", label: "Minimo", kind: "number", unit: "persone", allowVariable: true },
    { key: "includeBackOffice", label: "Conta anche il back office", kind: "boolean" },
  ],
  describe(rule, p, { variables, departments }) {
    const n = describeNumber(p.min, variables, ["persona", "persone"]);
    const bo = p.includeBackOffice ? " (back office compreso)" : "";
    return `${scopeLabel(p.scope, departments)}: almeno ${n}${bo} · ${describeDays(rule.days)} · ${describeWindows(rule)}${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    const min = resolveNumber(p.min, ctx.variables);
    const label = scopeLabel(p.scope, ctx.departments);
    const mode = p.includeBackOffice ? "all" : "sale";
    const out: Violation[] = [];
    for (const date of ctx.days) {
      if (!ruleAppliesOn(rule, date)) continue;
      const windows = presenceWindows(ctx, rule, date);
      if (windows.length === 0) continue;
      const count = presenceCounter(ctx, date);
      out.push(
        ...scanPresence({
          rule,
          date,
          windows,
          count: (r) => count(r, p.scope, mode),
          violates: (n) => n < min,
          expected: min,
          worst: "min",
          label,
        }),
      );
    }
    return out;
  },
};
