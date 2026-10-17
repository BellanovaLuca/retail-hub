/**
 * `max_presence`: al massimo N persone dell'ambito in ogni fascia
 * (es. "Massimo 1 persona in back office il sabato").
 * Con `backOfficeOnly` conta solo chi è in back office e le fasce NON sono tagliate sull'orario di
 * apertura (il back office lavora anche prima dell'apertura): senza fasce vale tutta la giornata.
 */
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

export const maxPresenceParams = z.object({
  scope: scopeSchema,
  max: numberParamSchema,
  backOfficeOnly: z.boolean().default(false),
  /** Senza `backOfficeOnly`: conta anche il back office oltre alla forza vendita (default: no). */
  includeBackOffice: z.boolean().default(false),
});
export type MaxPresenceParams = z.infer<typeof maxPresenceParams>;

export const maxPresence: RuleTypeDefinition<MaxPresenceParams> = {
  type: "max_presence",
  label: "Presenza massima",
  description:
    "Non più di un certo numero di persone nelle fasce indicate (anche solo in back office).",
  paramsSchema: maxPresenceParams,
  defaultParams: { scope: { kind: "all" }, max: 1, backOfficeOnly: true, includeBackOffice: false },
  fields: [
    { key: "scope", label: "Ambito", kind: "scope", scopeKinds: ["zone", "department", "all"] },
    { key: "max", label: "Massimo", kind: "number", unit: "persone", allowVariable: true },
    { key: "backOfficeOnly", label: "Solo back office", kind: "boolean" },
    { key: "includeBackOffice", label: "Conta anche il back office", kind: "boolean" },
  ],
  describe(rule, p, { variables, departments }) {
    const who = p.backOfficeOnly ? "in back office" : "presenti";
    const scope = p.scope.kind === "all" ? "" : ` (${scopeLabel(p.scope, departments)})`;
    const fallback = p.backOfficeOnly ? "tutta la giornata" : "orario di apertura";
    return `Al massimo ${describeNumber(p.max, variables, ["persona", "persone"])} ${who}${scope} · ${describeDays(rule.days)} · ${describeWindows(rule, fallback)}${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    const max = resolveNumber(p.max, ctx.variables);
    const base = scopeLabel(p.scope, ctx.departments);
    const label = p.backOfficeOnly
      ? p.scope.kind === "all"
        ? "Back office"
        : `Back office ${base}`
      : base;
    const mode = p.backOfficeOnly ? "backOffice" : p.includeBackOffice ? "all" : "sale";
    const out: Violation[] = [];
    for (const date of ctx.days) {
      if (!ruleAppliesOn(rule, date)) continue;
      const windows = presenceWindows(ctx, rule, date, !p.backOfficeOnly);
      if (windows.length === 0) continue;
      const count = presenceCounter(ctx, date);
      out.push(
        ...scanPresence({
          rule,
          date,
          windows,
          count: (r) => count(r, p.scope, mode),
          violates: (n) => n > max,
          expected: max,
          worst: "max",
          label,
        }),
      );
    }
    return out;
  },
};
