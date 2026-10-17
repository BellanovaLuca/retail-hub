import "server-only";
import { addDays, format, parseISO } from "date-fns";
import type { Interval, OpeningHours } from "@/lib/domain/types";
import { evaluateRules, type RuleOverride } from "@/lib/rules/registry";
import { resolveSeedRules, STANDARD_RULE_SET } from "@/lib/rules/seed";
import type { RuleContext, RuleRecord, Variables, Violation } from "@/lib/rules/types";
import { peopleToInputs, shiftRecordsToInputs } from "@/lib/schedule/adapters";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { getDepartments } from "./people";
import {
  getAdminWeek,
  getSchedulePeople,
  getStoreCalendar,
  toShiftRecord,
  weekDates,
} from "./schedule";

type Db = Awaited<ReturnType<typeof createClient>>;

export type RuleRow = Tables<"planning_rules">;

export function toRuleRecord(row: RuleRow): RuleRecord {
  const windows = Array.isArray(row.time_windows) ? (row.time_windows as unknown[]) : [];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    params: row.params,
    days: row.days ?? [],
    timeWindows: windows
      .map((w) => w as { start?: string; end?: string; from?: string; to?: string })
      .map((w) => ({
        start: (w.start ?? w.from ?? "") as string,
        end: (w.end ?? w.to ?? "") as string,
      }))
      .filter((w) => /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end)),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    severity: row.severity,
    active: row.active,
  };
}

export async function getVariables(db: Db) {
  const { data } = await db.from("planning_variables").select("*").order("key");
  return data ?? [];
}

export function variablesMap(rows: { key: string; value: number }[]): Variables {
  return Object.fromEntries(rows.map((v) => [v.key, Number(v.value)]));
}

/** Crea il set "Standard" con regole e variabili del seed, se non esiste ancora nessun set. */
export async function installStandardRuleSet(
  db: Db,
): Promise<{ created: boolean; setId: string | null }> {
  const { data: existing } = await db.from("planning_rule_sets").select("id").limit(1);
  if (existing && existing.length > 0) return { created: false, setId: existing[0].id };

  const departments = await getDepartments(db);
  const rules = resolveSeedRules(
    STANDARD_RULE_SET,
    departments.map((d) => ({ id: d.id, name: d.name })),
  );

  await db
    .from("planning_variables")
    .upsert(STANDARD_RULE_SET.variables, { onConflict: "key", ignoreDuplicates: true });
  const { data: set, error } = await db
    .from("planning_rule_sets")
    .insert({
      name: STANDARD_RULE_SET.name,
      description: STANDARD_RULE_SET.description,
      is_default: true,
    })
    .select("id")
    .single();
  if (error || !set) throw error ?? new Error("Set non creato");

  const { error: rulesError } = await db.from("planning_rules").insert(
    rules.map((r) => ({
      rule_set_id: set.id,
      name: r.name,
      type: r.type,
      params: r.params as never,
      days: r.days,
      time_windows: r.timeWindows,
      valid_from: r.validFrom,
      valid_to: r.validTo,
      severity: r.severity,
      active: r.active,
      sort_order: r.sortOrder,
    })),
  );
  if (rulesError) throw rulesError;
  return { created: true, setId: set.id };
}

function toOpeningHours(map: Record<string, { open: string; close: string } | null>): OpeningHours {
  const out: OpeningHours = {};
  for (let d = 1; d <= 7; d++) {
    const v = map[String(d)];
    out[d] = v ? { start: v.open, end: v.close } : null;
  }
  return out;
}

/** Contesto delle regole sulla versione di LAVORO della settimana (solo admin). */
export async function buildRuleContext(db: Db, weekStart: string): Promise<RuleContext> {
  const days = weekDates(weekStart);
  const prevStart = format(addDays(parseISO(weekStart), -7), "yyyy-MM-dd");
  const [week, people, departments, calendar, variables, { data: prevWeek }] = await Promise.all([
    getAdminWeek(db, weekStart),
    getSchedulePeople(db),
    getDepartments(db),
    getStoreCalendar(db, days[0], days[6]),
    getVariables(db),
    db.from("schedule_weeks").select("id").eq("week_start", prevStart).maybeSingle(),
  ]);
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const prevShifts = prevWeek
    ? ((await db.from("shifts").select("*").eq("week_id", prevWeek.id)).data ?? []).map(
        toShiftRecord,
      )
    : [];

  return {
    weekStart,
    days,
    shifts: shiftRecordsToInputs(week.shifts, peopleMap),
    leaves: week.leaves.map((l) => ({
      profileId: l.profileId,
      date: l.date,
      type: l.type,
      hours: l.hours,
      status: l.status,
    })),
    people: peopleToInputs(people),
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    openingHours: toOpeningHours(calendar.openingHours),
    openingExceptions: Object.fromEntries(
      Object.entries(calendar.exceptions).map(([d, v]) => [
        d,
        v ? ({ start: v.open, end: v.close } as Interval) : null,
      ]),
    ),
    holidays: calendar.holidays.map((h) => ({ date: h.date, storeClosed: h.storeClosed })),
    variables: variablesMap(variables),
    previousWeekShifts: shiftRecordsToInputs(prevShifts, peopleMap),
  };
}

/** Set di regole della settimana: quello scelto, altrimenti il predefinito. */
export async function getWeekRules(
  db: Db,
  ruleSetId: string | null,
): Promise<{ setId: string | null; rules: RuleRecord[] }> {
  let setId = ruleSetId;
  if (!setId) {
    const { data } = await db
      .from("planning_rule_sets")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();
    setId = data?.id ?? null;
  }
  if (!setId) return { setId: null, rules: [] };
  const { data } = await db
    .from("planning_rules")
    .select("*")
    .eq("rule_set_id", setId)
    .order("sort_order");
  return { setId, rules: (data ?? []).map(toRuleRecord) };
}

export type WeekEvaluation = {
  violations: Violation[];
  ignored: { id: string; ruleId: string; date: string | null; note: string }[];
  context: RuleContext;
};

/** Valuta le regole della settimana (versione di lavoro) tenendo conto degli avvisi ignorati. */
export async function evaluateWeek(db: Db, weekStart: string): Promise<WeekEvaluation> {
  const context = await buildRuleContext(db, weekStart);
  const { data: week } = await db
    .from("schedule_weeks")
    .select("id, rule_set_id")
    .eq("week_start", weekStart)
    .single();
  const { rules } = await getWeekRules(db, week?.rule_set_id ?? null);
  const { data: overrides } = week
    ? await db.from("rule_overrides").select("id, rule_id, date, note").eq("week_id", week.id)
    : { data: [] };
  const list: RuleOverride[] = (overrides ?? []).map((o) => ({ ruleId: o.rule_id, date: o.date }));
  return {
    violations: evaluateRules(context, rules, { overrides: list }),
    ignored: (overrides ?? []).map((o) => ({
      id: o.id,
      ruleId: o.rule_id,
      date: o.date,
      note: o.note,
    })),
    context,
  };
}
