/**
 * Regole di obiettivo di default delle voci (kpi_definitions.default_target_rule, §8.3):
 * validazione del jsonb salvato nel database e descrizione leggibile per l'interfaccia.
 */
import { z } from "zod";
import type { DefaultTargetRule } from "@/lib/targets";

export const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assignment") }),
  z.object({
    type: z.literal("pct_of"),
    kpi: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    pct: z
      .number()
      .positive("La percentuale deve essere maggiore di zero.")
      .max(10, "Al massimo 1000%."),
  }),
  z.object({
    type: z.literal("fixed"),
    value: z
      .number()
      .min(0, "Il valore non può essere negativo.")
      .max(100_000, "Al massimo 100.000."),
  }),
]);

/** Il jsonb del database come regola tipizzata; valori non validi o assenti → nessuna regola. */
export function parseRule(raw: unknown): DefaultTargetRule {
  if (raw === null || raw === undefined) return null;
  const parsed = ruleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const pctText = (pct: number) =>
  `${(Math.round(pct * 1000) / 10).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;

/** "Dall'assegnazione" · "20% di N. WO" · "Fisso 1" · "Manuale". */
export function describeRule(rule: DefaultTargetRule, labelOf: (code: string) => string): string {
  if (!rule) return "Manuale";
  if (rule.type === "assignment") return "Dall'assegnazione";
  if (rule.type === "fixed") return `Fisso ${rule.value.toLocaleString("it-IT")}`;
  return `${pctText(rule.pct)} di ${labelOf(rule.kpi)}`;
}

/** true se la regola `pct_of` di `code` porta, seguendo la catena, di nuovo a `code`. */
export function createsCycle(
  code: string,
  rule: DefaultTargetRule,
  rules: Map<string, DefaultTargetRule>,
): boolean {
  let current = rule;
  const seen = new Set([code]);
  while (current?.type === "pct_of") {
    if (seen.has(current.kpi)) return true;
    seen.add(current.kpi);
    current = rules.get(current.kpi) ?? null;
  }
  return false;
}
