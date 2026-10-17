/**
 * `max_on_leave`: al massimo N persone (di un reparto o in totale) in ferie lo stesso giorno
 * (es. "Massimo 2 Ottici in ferie insieme"). Contano le righe di `leaves` dei tipi indicati
 * (default: solo ferie), anche "da confermare" salvo `includeTentative = false`.
 * Le fasce orarie non si applicano; i giorni a negozio chiuso non si controllano.
 */
import { z } from "zod";
import { formatDayShort } from "@/lib/domain/time";
import {
  baseViolation,
  describeDays,
  describeNumber,
  describeValidity,
  formatNumber,
  numberParamSchema,
  openingFor,
  peopleScopeSchema,
  resolveNumber,
  ruleAppliesOn,
} from "../common";
import type { RuleTypeDefinition, Violation } from "../types";

export const maxOnLeaveParams = z.object({
  scope: peopleScopeSchema,
  max: numberParamSchema,
  leaveTypes: z
    .array(z.enum(["ferie", "permesso", "malattia", "altro"]))
    .min(1)
    .default(["ferie"]),
  includeTentative: z.boolean().default(true),
});
export type MaxOnLeaveParams = z.infer<typeof maxOnLeaveParams>;

const TYPE_LABELS = {
  ferie: "ferie",
  permesso: "permesso",
  malattia: "malattia",
  altro: "assenti",
};

export const maxOnLeave: RuleTypeDefinition<MaxOnLeaveParams> = {
  type: "max_on_leave",
  label: "Massimo in ferie",
  description: "Non più di un certo numero di persone in ferie (o assenti) nello stesso giorno.",
  paramsSchema: maxOnLeaveParams,
  defaultParams: { scope: { kind: "all" }, max: 2, leaveTypes: ["ferie"], includeTentative: true },
  fields: [
    { key: "scope", label: "Ambito", kind: "scope", scopeKinds: ["department", "all"] },
    { key: "max", label: "Massimo", kind: "number", unit: "persone", allowVariable: true },
    {
      key: "leaveTypes",
      label: "Tipi di assenza",
      kind: "select",
      options: [
        { value: "ferie", label: "Ferie" },
        { value: "permesso", label: "Permesso" },
        { value: "malattia", label: "Malattia" },
        { value: "altro", label: "Altro" },
      ],
    },
    { key: "includeTentative", label: "Conta anche le ferie da confermare", kind: "boolean" },
  ],
  describe(rule, p, { variables, departments }) {
    const s = p.scope;
    const scope =
      s.kind === "all"
        ? ""
        : ` (${departments.find((d) => d.id === s.departmentId)?.name ?? "reparto sconosciuto"})`;
    const kinds = p.leaveTypes.map((t) => TYPE_LABELS[t]).join("/");
    return `Al massimo ${describeNumber(p.max, variables, ["persona", "persone"])}${scope} in ${kinds} lo stesso giorno · ${describeDays(rule.days)}${describeValidity(rule)}`;
  },
  evaluate(ctx, rule, p) {
    const max = resolveNumber(p.max, ctx.variables);
    const scope = p.scope;
    const inScope = new Set(
      ctx.people
        .filter(
          (person) => scope.kind === "all" || person.departmentIds.includes(scope.departmentId),
        )
        .map((person) => person.id),
    );
    const scopeName =
      scope.kind === "all"
        ? "Persone"
        : (ctx.departments.find((d) => d.id === scope.departmentId)?.name ?? "Reparto");
    const out: Violation[] = [];
    for (const date of ctx.days) {
      if (!ruleAppliesOn(rule, date) || !openingFor(ctx, date)) continue;
      const away = new Set(
        ctx.leaves
          .filter(
            (l) =>
              l.date === date &&
              inScope.has(l.profileId) &&
              p.leaveTypes.includes(l.type) &&
              (p.includeTentative || l.status === "confirmed"),
          )
          .map((l) => l.profileId),
      );
      if (away.size <= max) continue;
      out.push({
        ...baseViolation(rule),
        date,
        actual: away.size,
        expected: max,
        message: `${formatDayShort(date)} · ${scopeName} in ${p.leaveTypes.map((t) => TYPE_LABELS[t]).join("/")}: ${away.size}/${formatNumber(max)} · regola '${rule.name}'`,
      });
    }
    return out;
  },
};
