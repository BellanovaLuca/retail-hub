import type { Metadata } from "next";
import { NoteForm } from "@/components/performance/note-form";
import { ProgressBadge } from "@/components/performance/progress-badge";
import { YearSelect } from "@/components/performance/year-select";
import { EmptyState } from "@/components/ui/feedback";
import { requireProfile } from "@/lib/auth/session";
import { getMyGoals, getPeriods, type MyGoal } from "@/lib/data/performance";
import { nowInRome } from "@/lib/dates";
import { parseYearParam } from "@/lib/leaves/plan";
import { PILLARS, periodLabel, slotCode, yearOptions } from "@/lib/performance/goals";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireProfile();
  const sp = await searchParams;
  const current = nowInRome().getFullYear();
  const year = parseYearParam(Array.isArray(sp.anno) ? sp.anno[0] : sp.anno, current);

  const supabase = await createClient();
  const periods = await getPeriods(supabase);
  const period = periods.find((p) => p.year === year);
  // Solo la vista my_performance_goals: le proprie righe, pubblicate, senza nota privata.
  const goals = period ? await getMyGoals(supabase, period.id) : [];
  const years = yearOptions(
    periods.map((p) => p.year),
    current,
  ).filter((y) => y <= current || periods.some((p) => p.year === y));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 eyebrow">Obiettivi dell&apos;anno</p>
          <h1 className="font-display text-4xl font-light tracking-tight sm:text-[2.75rem]">
            {period?.label ?? periodLabel(year)}
          </h1>
        </div>
        <YearSelect year={year} years={years} basePath="/performance" mode="query" />
      </header>

      {goals.length === 0 ? (
        <EmptyState title={`I tuoi obiettivi del ${year} non sono ancora stati pubblicati.`}>
          <p>Quando il responsabile li pubblica ricevi una notifica e li trovi qui.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-8">
          {PILLARS.map((pillar) => {
            const list = goals.filter((g) => g.pillar === pillar.id);
            return (
              <section key={pillar.id} aria-label={pillar.label} className="flex flex-col gap-6">
                <h2 className="border-b border-foreground pb-2 eyebrow text-foreground">
                  {pillar.label}
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">Nessun obiettivo pubblicato.</p>
                ) : (
                  list.map((g) => <GoalCard key={g.id} goal={g} />)
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: MyGoal }) {
  return (
    <article className="flex flex-col gap-5 rounded-lg border border-line p-5 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{slotCode(goal.pillar, goal.slot)}</p>
          <h3 className="mt-1 font-display text-xl font-light tracking-tight">
            {goal.title || "Obiettivo"}
          </h3>
        </div>
        <ProgressBadge progress={goal.progress} />
      </header>
      {goal.objective ? (
        <p className="text-sm leading-relaxed whitespace-pre-line">{goal.objective}</p>
      ) : null}
      {goal.comment ? (
        <div>
          <p className="mb-1.5 eyebrow">Commento</p>
          <p className="border-l-2 border-foreground pl-3 text-sm whitespace-pre-line">
            {goal.comment}
          </p>
        </div>
      ) : null}
      <NoteForm goalId={goal.id} initial={goal.employeeNote} />
    </article>
  );
}
