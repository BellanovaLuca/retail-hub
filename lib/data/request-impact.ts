import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { evaluateRules } from "@/lib/rules/registry";
import type { Violation } from "@/lib/rules/types";
import type { createClient } from "@/lib/supabase/server";
import { weekStart } from "@/lib/dates";
import { buildRuleContext, getWeekRules } from "./rules";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Effetto sulla copertura di una richiesta di assenza: avvisi che comparirebbero togliendo
 * i turni della persona in quei giorni (versione di lavoro dei turni). Al massimo 3 settimane.
 */
export async function requestCoverageImpact(
  db: Db,
  r: {
    profile_id: string;
    start_date: string;
    end_date: string;
    recurring_weekdays: number[] | null;
    type: string;
  },
): Promise<{ added: Violation[]; weeks: string[] }> {
  if (!["ferie", "permesso", "giorno_libero", "indisponibilita", "malattia"].includes(r.type)) {
    return { added: [], weeks: [] };
  }
  const weeks: string[] = [];
  for (
    let w = weekStart(parseISO(r.start_date));
    w <= parseISO(r.end_date) && weeks.length < 3;
    w = addDays(w, 7)
  ) {
    weeks.push(format(w, "yyyy-MM-dd"));
  }
  const inRequest = (date: string) =>
    date >= r.start_date &&
    date <= r.end_date &&
    (!r.recurring_weekdays?.length ||
      r.recurring_weekdays.includes(((parseISO(date).getDay() + 6) % 7) + 1));

  const added: Violation[] = [];
  for (const week of weeks) {
    const { data: row } = await db
      .from("schedule_weeks")
      .select("rule_set_id")
      .eq("week_start", week)
      .maybeSingle();
    const [ctx, { rules }] = await Promise.all([
      buildRuleContext(db, week),
      getWeekRules(db, row?.rule_set_id ?? null),
    ]);
    const before = evaluateRules(ctx, rules);
    const after = evaluateRules(
      {
        ...ctx,
        shifts: ctx.shifts.filter((s) => !(s.profileId === r.profile_id && inRequest(s.date))),
      },
      rules,
    );
    const seen = new Set(before.filter((v) => v.severity === "warning").map((v) => v.message));
    added.push(...after.filter((v) => v.severity === "warning" && !seen.has(v.message)));
  }
  return { added, weeks };
}
