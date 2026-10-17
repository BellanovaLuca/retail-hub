import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GoalSheet, type SheetGoal } from "@/components/performance/goal-sheet";
import { Button } from "@/components/ui/button";
import { PersonDot } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import { ensurePeriod, getPeriodGoals } from "@/lib/data/performance";
import { getDepartments } from "@/lib/data/people";
import { getSchedulePeople } from "@/lib/data/schedule";
import { nowInRome } from "@/lib/dates";
import { parseYearParam } from "@/lib/leaves/plan";
import { SLOTS, slotKey } from "@/lib/performance/goals";
import { groupPeopleByDepartment } from "@/lib/schedule/view";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Scheda performance" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GoalSheetPage({
  params,
}: {
  params: Promise<{ year: string; profileId: string }>;
}) {
  await requireAdmin();
  const { year: param, profileId } = await params;
  const year = parseYearParam(param, nowInRome().getFullYear());
  if (String(year) !== param) redirect(`/admin/performance/${year}/${profileId}`);
  if (!UUID.test(profileId)) notFound();

  const supabase = await createClient();
  const period = await ensurePeriod(supabase, year);
  const [people, departments, goals] = await Promise.all([
    getSchedulePeople(supabase),
    getDepartments(supabase),
    getPeriodGoals(supabase, period.id, profileId),
  ]);
  const person = people.find((p) => p.id === profileId);
  if (!person) notFound();

  // Persona precedente e successiva nello stesso ordine della tabella.
  const ordered = groupPeopleByDepartment(people, departments).flatMap((g) => g.people);
  const index = ordered.findIndex((p) => p.id === profileId);
  const prev = ordered[index - 1];
  const next = ordered[index + 1];

  const bySlot = new Map(goals.map((g) => [slotKey(g.pillar, g.slot), g]));
  const sheet: SheetGoal[] = SLOTS.map((s) => {
    const g = bySlot.get(slotKey(s.pillar, s.slot));
    return {
      pillar: s.pillar,
      slot: s.slot,
      title: g?.title ?? "",
      objective: g?.objective ?? "",
      progress: g?.progress ?? null,
      comment: g?.comment ?? "",
      privateNote: g?.privateNote ?? "",
      employeeNote: g?.employeeNote ?? null,
      published: g?.published ?? false,
    };
  });
  const department = departments.find((d) => d.id === person.primaryDepartmentId);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <Link
          href={`/admin/performance/${year}`}
          className="inline-flex items-center gap-2 self-start link-underline text-sm text-muted"
        >
          <ArrowLeft className="size-4 stroke-[1.5]" aria-hidden /> {period.label}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <PersonDot color={person.color} className="size-3" />
          <h1 className="font-display text-4xl font-light tracking-tight">{person.displayName}</h1>
          {department ? <span className="text-sm text-muted">{department.name}</span> : null}
          <span className="ml-auto flex gap-1">
            {prev ? (
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={`Scheda di ${prev.displayName}`}
              >
                <Link href={`/admin/performance/${year}/${prev.id}`}>
                  <ChevronLeft />
                </Link>
              </Button>
            ) : null}
            {next ? (
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={`Scheda di ${next.displayName}`}
              >
                <Link href={`/admin/performance/${year}/${next.id}`}>
                  <ChevronRight />
                </Link>
              </Button>
            ) : null}
          </span>
        </div>
      </header>
      <GoalSheet
        key={profileId}
        year={year}
        profileId={profileId}
        displayName={person.displayName}
        department={department ? { id: department.id, name: department.name } : null}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        goals={sheet}
      />
    </div>
  );
}
