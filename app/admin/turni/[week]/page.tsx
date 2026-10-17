import { addDays, format, parseISO } from "date-fns";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDepartments } from "@/lib/data/people";
import {
  getAdminWeek,
  getSchedulePeople,
  getStoreCalendar,
  getTemplates,
  normalizeWeekParam,
} from "@/lib/data/schedule";
import { nowInRome, toISODate, weekNumber } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { computeCoverage } from "@/lib/coverage";
import { evaluateWeek, installStandardRuleSet } from "@/lib/data/rules";
import { EditorWithRules, type DayCoverage } from "./editor-with-rules";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  return { title: `Turni · Week ${weekNumber(parseISO(week))}` };
}

export default async function WeekEditorPage({ params }: { params: Promise<{ week: string }> }) {
  const me = await requireAdmin();
  const { week: param } = await params;
  const weekStart = normalizeWeekParam(param, nowInRome());
  if (weekStart !== param) redirect(`/admin/turni/${weekStart}`);

  const supabase = await createClient();
  await installStandardRuleSet(supabase);
  const sunday = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
  const [
    data,
    people,
    templates,
    departments,
    calendar,
    { data: weekTemplates },
    { data: ruleSets },
  ] = await Promise.all([
    getAdminWeek(supabase, weekStart),
    getSchedulePeople(supabase),
    getTemplates(supabase),
    getDepartments(supabase),
    getStoreCalendar(supabase, weekStart, sunday),
    supabase.from("schedule_templates").select("id, name").order("name"),
    supabase.from("planning_rule_sets").select("id, name, is_default").order("name"),
  ]);

  const evaluation = await evaluateWeek(supabase, weekStart);
  const { data: pendingRows } = await supabase
    .from("requests")
    .select("profile_id, start_date, end_date, recurring_weekdays")
    .in("status", ["pending", "peer_accepted"])
    .in("type", ["ferie", "permesso", "giorno_libero", "indisponibilita", "malattia"])
    .lte("start_date", sunday)
    .gte("end_date", weekStart);
  const pendingRequests = (pendingRows ?? []).flatMap((r) =>
    data.days
      .filter(
        (d) =>
          d >= r.start_date &&
          d <= r.end_date &&
          (!r.recurring_weekdays?.length ||
            r.recurring_weekdays.includes(((parseISO(d).getDay() + 6) % 7) + 1)),
      )
      .map((d) => ({ profileId: r.profile_id, date: d })),
  );
  const { data: ruleRows } = await supabase.from("planning_rules").select("id, name");

  // Copertura minima per giorno nell'orario di apertura (riga "Copertura" in fondo al foglio).
  const coverage: DayCoverage = {};
  for (const date of data.days) {
    const weekday = ((parseISO(date).getDay() + 6) % 7) + 1;
    const hours =
      date in calendar.exceptions
        ? calendar.exceptions[date]
        : calendar.openingHours[String(weekday)];
    if (!hours || calendar.holidays.some((h) => h.date === date && h.storeClosed)) continue;
    const slots = computeCoverage({
      date,
      shifts: evaluation.context.shifts,
      people: evaluation.context.people,
      departments: evaluation.context.departments,
    });
    const open = slots.filter((s) => s.start >= hours.open && s.end <= hours.close);
    coverage[date] = {
      min: {
        vista: Math.min(...open.map((s) => s.vista)),
        sole: Math.min(...open.map((s) => s.sole)),
        delta: Math.min(...open.map((s) => s.delta)),
      },
      copOtt: open.every((s) => s.copOtt),
      slots,
    };
  }

  return (
    <EditorWithRules
      violations={evaluation.violations}
      ignored={evaluation.ignored}
      ruleNames={Object.fromEntries((ruleRows ?? []).map((r) => [r.id, r.name]))}
      coverage={coverage}
      pendingRequests={pendingRequests}
      me={{ id: me.id, displayName: me.display_name }}
      week={data.week}
      days={data.days}
      today={toISODate(nowInRome())}
      shifts={data.shifts}
      leaves={data.leaves}
      people={people}
      templates={templates}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      calendar={calendar}
      weekTemplates={weekTemplates ?? []}
      ruleSets={ruleSets ?? []}
    />
  );
}
