/**
 * `opening_presence`: almeno N persone nella fascia [apertura − minuti, apertura]
 * (es. apertura back office: almeno 1 persona dalle 08:30 con apertura alle 10:00).
 * Le fasce orarie della regola sono ignorate: la fascia dipende dall'orario di apertura del giorno
 * (eccezioni comprese). Negozio chiuso → nessun controllo.
 */
import { z } from "zod";
import {
  describeDays,
  describeNumber,
  describeValidity,
  numberParamSchema,
  openingFor,
  presenceCounter,
  resolveNumber,
  ruleAppliesOn,
  scanPresence,
  scopeLabel,
  scopeSchema,
} from "../common";
import type { RuleTypeDefinition, Violation } from "../types";

export const openingPresenceParams = z.object({
  minutesBeforeOpening: numberParamSchema,
  min: numberParamSchema,
  scope: scopeSchema.default({ kind: "all" }),
  /** Default sì: chi apre il negozio di solito è in back office. */
  includeBackOffice: z.boolean().default(true),
});
export type OpeningPresenceParams = z.infer<typeof openingPresenceParams>;

export const openingPresence: RuleTypeDefinition<OpeningPresenceParams> = {
  type: "opening_presence",
  label: "Presenza prima dell'apertura",
  description: "Almeno un certo numero di persone nei minuti che precedono l'apertura al pubblico.",
  paramsSchema: openingPresenceParams,
  defaultParams: {
    minutesBeforeOpening: 90,
    min: 1,
    scope: { kind: "all" },
    includeBackOffice: true,
  },
  fields: [
    {
      key: "minutesBeforeOpening",
      label: "Minuti prima dell'apertura",
      kind: "number",
      unit: "min",
      allowVariable: true,
    },
    { key: "min", label: "Minimo", kind: "number", unit: "persone", allowVariable: true },
    { key: "scope", label: "Ambito", kind: "scope", scopeKinds: ["zone", "department", "all"] },
    { key: "includeBackOffice", label: "Conta anche il back office", kind: "boolean" },
  ],
  describe(rule, p, { variables, departments }) {
    const scope = p.scope.kind === "all" ? "" : ` (${scopeLabel(p.scope, departments)})`;
    return `Almeno ${describeNumber(p.min, variables, ["persona", "persone"])}${scope} da ${describeNumber(p.minutesBeforeOpening, variables, ["minuto", "minuti"])} prima dell'apertura · ${describeDays(rule.days)}${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    const min = resolveNumber(p.min, ctx.variables);
    const before = resolveNumber(p.minutesBeforeOpening, ctx.variables);
    const label =
      p.scope.kind === "all" ? "Apertura" : `Apertura ${scopeLabel(p.scope, ctx.departments)}`;
    const mode = p.includeBackOffice ? "all" : "sale";
    const out: Violation[] = [];
    for (const date of ctx.days) {
      if (!ruleAppliesOn(rule, date)) continue;
      const opening = openingFor(ctx, date);
      if (!opening || before <= 0) continue;
      const window = { start: Math.max(0, opening.start - before), end: opening.start };
      const count = presenceCounter(ctx, date);
      out.push(
        ...scanPresence({
          rule,
          date,
          windows: [window],
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
