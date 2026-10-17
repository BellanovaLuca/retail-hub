/**
 * Tipi del motore di regole di pianificazione (§7.3).
 * Ogni tipo di regola è un modulo in `lib/rules/types/` che esporta una `RuleTypeDefinition`.
 */
import type { z } from "zod";
import type {
  DepartmentRef,
  ISODate,
  Interval,
  LeaveInput,
  OpeningHours,
  PersonInput,
  ShiftInput,
  Time,
} from "@/lib/domain/types";

export type RuleSeverity = "warning" | "info";

/** Una regola salvata, come una riga di `planning_rules`. */
export type RuleRecord = {
  id: string;
  name: string;
  type: string;
  /** Validati con lo schema zod del tipo: dati non fidati. */
  params: unknown;
  /** Giorni ISO 1..7 (1 = lunedì); vuoto = tutti i giorni. */
  days: number[];
  /** Fasce di validità; vuoto = tutto l'orario di apertura. */
  timeWindows: Interval[];
  validFrom: ISODate | null;
  validTo: ISODate | null;
  severity: RuleSeverity;
  active: boolean;
};

/** Variabili con nome (`planning_variables`): chiave → valore. */
export type Variables = Record<string, number>;

/** Parametro numerico: un numero fisso oppure il richiamo di una variabile con nome. */
export type NumberParam = number | { var: string };

export type Violation = {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  severity: RuleSeverity;
  date?: ISODate;
  start?: Time;
  end?: Time;
  profileId?: string;
  actual?: number;
  expected?: number;
  /** Es. "Mar 14 · 12:00–12:30 · Sole: 1/2 · regola 'Sole sera'". */
  message: string;
};

/** Tutto ciò che serve per valutare le regole su una settimana. */
export type RuleContext = {
  weekStart: ISODate;
  days: ISODate[];
  shifts: ShiftInput[];
  leaves: LeaveInput[];
  people: PersonInput[];
  departments: DepartmentRef[];
  openingHours: OpeningHours;
  /** Eccezioni per singolo giorno: un orario diverso, oppure null = chiuso. */
  openingExceptions?: Record<ISODate, Interval | null>;
  holidays: { date: ISODate; storeClosed: boolean }[];
  variables: Variables;
  /** Turni della settimana precedente: riposo tra turni e giorni consecutivi a cavallo. */
  previousWeekShifts?: ShiftInput[];
};

/** Contesto per generare la frase leggibile della regola. */
export type DescribeContext = { variables: Variables; departments: DepartmentRef[] };

/** Descrizione di un campo del form, per generare l'interfaccia del tipo di regola. */
export type FieldDescriptor = {
  key: string;
  label: string;
  kind: "number" | "boolean" | "scope" | "select" | "time" | "days";
  options?: { value: string; label: string }[];
  unit?: string;
  /** Il campo accetta anche una variabile con nome al posto del numero. */
  allowVariable?: boolean;
  /** Per "scope": quali ambiti sono ammessi. */
  scopeKinds?: ("zone" | "department" | "all")[];
  help?: string;
};

export type RuleTypeDefinition<P> = {
  type: string;
  label: string;
  description: string;
  paramsSchema: z.ZodType<P>;
  defaultParams: P;
  fields: FieldDescriptor[];
  /** Frase leggibile, es. "Sole: almeno 1 persona · lun–dom · 10:00–12:00". */
  describe(rule: RuleRecord, params: P, ctx: DescribeContext): string;
  /** Funzione pura: violazioni della regola nella settimana (il motore applica poi gli override). */
  evaluate(ctx: RuleContext, rule: RuleRecord, params: P): Violation[];
};
