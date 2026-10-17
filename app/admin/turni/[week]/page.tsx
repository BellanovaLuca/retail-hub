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
import { ShiftEditor } from "./shift-editor";

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

  return (
    <ShiftEditor
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
