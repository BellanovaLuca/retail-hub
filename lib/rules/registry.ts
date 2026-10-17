/**
 * Registro dei tipi di regola e motore di valutazione (§7.3).
 * Aggiungere un tipo = scrivere un modulo in `lib/rules/types/` e aggiungere una riga in `RULE_TYPES`.
 */
import type { ISODate } from "@/lib/domain/types";
import { RuleConfigError } from "./common";
import type {
  DescribeContext,
  RuleContext,
  RuleRecord,
  RuleTypeDefinition,
  Violation,
} from "./types";
import { mandatoryBreak } from "./types/mandatory-break";
import { maxConsecutiveDays } from "./types/max-consecutive-days";
import { maxOnLeave } from "./types/max-on-leave";
import { maxPresence } from "./types/max-presence";
import { minPresence } from "./types/min-presence";
import { minRestBetweenShifts } from "./types/min-rest-between-shifts";
import { minWeeklyRestDays } from "./types/min-weekly-rest-days";
import { openingPresence } from "./types/opening-presence";
import { weeklyHoursDeviation } from "./types/weekly-hours-deviation";

export { resolveNumber, RuleConfigError } from "./common";

/** Tipo di regola con i parametri "cancellati": valida i parametri grezzi e poi delega al modulo. */
export type RegisteredRuleType = {
  type: string;
  label: string;
  description: string;
  definition: RuleTypeDefinition<unknown>;
  /** Valida i parametri grezzi; in caso di errore restituisce il messaggio in italiano. */
  parse(raw: unknown): { ok: true; params: unknown } | { ok: false; error: string };
  evaluate(ctx: RuleContext, rule: RuleRecord, params: unknown): Violation[];
  describe(rule: RuleRecord, params: unknown, ctx: DescribeContext): string;
};

function register<P>(def: RuleTypeDefinition<P>): RegisteredRuleType {
  return {
    type: def.type,
    label: def.label,
    description: def.description,
    definition: def as unknown as RuleTypeDefinition<unknown>,
    parse(raw) {
      const result = def.paramsSchema.safeParse(raw ?? {});
      if (result.success) return { ok: true, params: result.data };
      const issue = result.error.issues[0];
      const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
      return { ok: false, error: `${issue?.message ?? "parametri non validi"}${where}` };
    },
    // `params` arriva sempre da `parse`, quindi ha già la forma P.
    evaluate: (ctx, rule, params) => def.evaluate(ctx, rule, params as P),
    describe: (rule, params, ctx) => def.describe(rule, params as P, ctx),
  };
}

/** Tutti i tipi di regola disponibili, nell'ordine in cui compaiono nel form. */
export const RULE_TYPES: RegisteredRuleType[] = [
  register(minPresence),
  register(maxPresence),
  register(openingPresence),
  register(maxOnLeave),
  register(weeklyHoursDeviation),
  register(minRestBetweenShifts),
  register(maxConsecutiveDays),
  register(minWeeklyRestDays),
  register(mandatoryBreak),
];

const BY_TYPE = new Map(RULE_TYPES.map((t) => [t.type, t]));

export function getRuleType(type: string): RegisteredRuleType | undefined {
  return BY_TYPE.get(type);
}

/** Valida i parametri di una regola con lo schema del suo tipo. */
export function validateRuleParams(
  type: string,
  params: unknown,
): { ok: true; params: unknown } | { ok: false; error: string } {
  const def = getRuleType(type);
  if (!def) return { ok: false, error: `tipo di regola "${type}" sconosciuto` };
  return def.parse(params);
}

/** Avviso ignorato: `date` null = per tutta la settimana. */
export type RuleOverride = { ruleId: string; date: ISODate | null };

function configViolation(rule: RuleRecord, reason: string): Violation {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    severity: "info",
    message: `Regola '${rule.name}' non configurata correttamente: ${reason}`,
  };
}

function compareViolations(a: Violation, b: Violation): number {
  // Prima quelle con data (in ordine di data e ora), poi quelle settimanali.
  if (a.date !== b.date) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  }
  const sa = a.start ?? "";
  const sb = b.start ?? "";
  if (sa !== sb) return sa < sb ? -1 : 1;
  if (a.ruleName !== b.ruleName) return a.ruleName.localeCompare(b.ruleName, "it");
  return (a.profileId ?? "").localeCompare(b.profileId ?? "");
}

/**
 * Valuta le regole sulla settimana. Non lancia mai: parametri non validi, variabili mancanti, tipi
 * sconosciuti o errori interni diventano una violazione "info" che segnala la regola mal configurata.
 * Le regole non attive sono saltate; gli override eliminano le violazioni di quella regola in quel
 * giorno (o in tutta la settimana se `date` è null). Risultato ordinato per data e ora.
 */
export function evaluateRules(
  ctx: RuleContext,
  rules: RuleRecord[],
  options: { overrides?: RuleOverride[] } = {},
): Violation[] {
  const overrides = options.overrides ?? [];
  const out: Violation[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const def = getRuleType(rule.type);
    if (!def) {
      out.push(configViolation(rule, `tipo di regola "${rule.type}" sconosciuto`));
      continue;
    }
    const parsed = def.parse(rule.params);
    if (!parsed.ok) {
      out.push(configViolation(rule, parsed.error));
      continue;
    }
    try {
      out.push(...def.evaluate(ctx, rule, parsed.params));
    } catch (err) {
      const reason =
        err instanceof RuleConfigError ? err.message : `errore interno (${String(err)})`;
      out.push(configViolation(rule, reason));
    }
  }
  return out
    .filter(
      (v) =>
        !overrides.some(
          (o) => o.ruleId === v.ruleId && (o.date === null || (v.date && o.date === v.date)),
        ),
    )
    .sort(compareViolations);
}

/** Frase leggibile della regola (es. "Sole: almeno 1 persona · lun–dom · 10:00–12:00"). */
export function describeRule(rule: RuleRecord, ctx: DescribeContext): string {
  const def = getRuleType(rule.type);
  if (!def) return `Tipo di regola "${rule.type}" sconosciuto`;
  const parsed = def.parse(rule.params);
  if (!parsed.ok) return `Regola non valida: ${parsed.error}`;
  try {
    return def.describe(rule, parsed.params, ctx);
  } catch {
    return `Regola non valida`;
  }
}
