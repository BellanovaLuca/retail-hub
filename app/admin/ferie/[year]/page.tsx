import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LeavePlanner } from "@/components/leaves/leave-planner";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/session";
import { getLeaveThresholds, getYearLeaves } from "@/lib/data/leaves";
import { getDepartments } from "@/lib/data/people";
import { getSchedulePeople, getStoreCalendar } from "@/lib/data/schedule";
import { nowInRome, toISODate } from "@/lib/dates";
import { parseYearParam } from "@/lib/leaves/plan";
import { parsePlannerParams } from "@/lib/leaves/view-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const { year } = await params;
  return { title: `Planning ferie ${year}` };
}

export default async function AdminLeavesPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { year: param } = await params;
  const now = nowInRome();
  const year = parseYearParam(param, now.getFullYear());
  if (String(year) !== param) redirect(`/admin/ferie/${year}`);
  const today = toISODate(now);

  const supabase = await createClient();
  const [people, departments, leaves, calendar, thresholds] = await Promise.all([
    getSchedulePeople(supabase),
    getDepartments(supabase),
    getYearLeaves(supabase, year),
    getStoreCalendar(supabase, `${year}-01-01`, `${year}-12-31`),
    getLeaveThresholds(supabase),
  ]);
  const initial = parsePlannerParams(await searchParams, { year, today });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="mb-2 eyebrow">Ferie</p>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Anno precedente">
            <Link href={`/admin/ferie/${year - 1}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h1 className="font-display text-4xl font-light tracking-tight nums">Planning {year}</h1>
          <Button asChild variant="ghost" size="icon" aria-label="Anno successivo">
            <Link href={`/admin/ferie/${year + 1}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </header>
      <LeavePlanner
        mode="admin"
        year={year}
        today={today}
        people={people.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          color: p.color,
          primaryDepartmentId: p.primaryDepartmentId,
          departmentIds: p.departmentIds,
        }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        leaves={leaves}
        holidays={calendar.holidays}
        thresholds={thresholds}
        initial={initial}
      />
    </div>
  );
}
