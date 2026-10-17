import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PeriodActions, PublishPersonButton } from "@/components/performance/period-actions";
import { ProgressBadge } from "@/components/performance/progress-badge";
import { YearSelect } from "@/components/performance/year-select";
import { EmptyState } from "@/components/ui/feedback";
import { PersonDot, Table, Td, Th } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import { ensurePeriod, getPeriodGoals, getPeriods, type AdminGoal } from "@/lib/data/performance";
import { getDepartments } from "@/lib/data/people";
import { getSchedulePeople } from "@/lib/data/schedule";
import { nowInRome } from "@/lib/dates";
import { parseYearParam } from "@/lib/leaves/plan";
import {
  SLOTS,
  isGoalDefined,
  publicationSummary,
  slotKey,
  yearOptions,
} from "@/lib/performance/goals";
import { groupPeopleByDepartment } from "@/lib/schedule/view";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const { year } = await params;
  return { title: `Performance ${year}` };
}

export default async function AdminPerformancePage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  await requireAdmin();
  const { year: param } = await params;
  const current = nowInRome().getFullYear();
  const year = parseYearParam(param, current);
  if (String(year) !== param) redirect(`/admin/performance/${year}`);

  const supabase = await createClient();
  // Il periodo "Performance AAAA" si crea alla prima apertura dell'anno.
  const period = await ensurePeriod(supabase, year);
  const [people, departments, goals, periods] = await Promise.all([
    getSchedulePeople(supabase),
    getDepartments(supabase),
    getPeriodGoals(supabase, period.id),
    getPeriods(supabase),
  ]);

  const byPerson = new Map<string, Map<string, AdminGoal>>();
  for (const g of goals) {
    const map = byPerson.get(g.profileId) ?? new Map<string, AdminGoal>();
    map.set(slotKey(g.pillar, g.slot), g);
    byPerson.set(g.profileId, map);
  }
  const activeIds = new Set(people.map((p) => p.id));
  const totals = publicationSummary(goals.filter((g) => activeIds.has(g.profileId)));
  const groups = groupPeopleByDepartment(people, departments);
  const deps = departments.map((d) => ({ id: d.id, name: d.name }));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 eyebrow">Performance annuale</p>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="font-display text-4xl font-light tracking-tight">{period.label}</h1>
            <YearSelect
              year={year}
              years={yearOptions(
                periods.map((p) => p.year),
                current,
              )}
              basePath="/admin/performance"
              mode="segment"
            />
          </div>
          <p className="mt-3 text-sm text-muted nums">
            {totals.defined} obiettivi definiti · {totals.published} pubblicati
            {totals.toPublish ? ` · ${totals.toPublish} da pubblicare` : ""}
          </p>
        </div>
        <PeriodActions year={year} departments={deps} toPublish={totals.toPublish} />
      </header>

      {people.length === 0 ? (
        <EmptyState title="Nessuna persona attiva." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Persona</Th>
              {SLOTS.map((s) => (
                <Th
                  key={s.code}
                  className={cn("text-center", s.code === "L1" && "border-l border-line")}
                >
                  {s.code}
                </Th>
              ))}
              <Th className="text-right">Pubblicati</Th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id}>
              <tr>
                <td colSpan={8} className="pt-6 pb-2 eyebrow">
                  {g.label}
                </td>
              </tr>
              {g.people.map((p) => {
                const mine = byPerson.get(p.id) ?? new Map<string, AdminGoal>();
                const summary = publicationSummary([...mine.values()]);
                const href = `/admin/performance/${year}/${p.id}`;
                return (
                  <tr key={p.id} className="hover:bg-surface/60">
                    <Td>
                      <Link
                        href={href}
                        className="inline-flex min-h-11 items-center gap-2 link-underline"
                      >
                        <PersonDot color={p.color} />
                        {p.displayName}
                      </Link>
                    </Td>
                    {SLOTS.map((s) => {
                      const goal = mine.get(slotKey(s.pillar, s.slot));
                      const defined = isGoalDefined(goal);
                      return (
                        <Td
                          key={s.code}
                          className={cn(
                            "p-0 text-center",
                            s.code === "L1" && "border-l border-line",
                          )}
                        >
                          <Link
                            href={`${href}#${s.code}`}
                            title={
                              defined
                                ? `${s.code} · ${goal!.title || goal!.objective}`
                                : `${s.code} · da definire`
                            }
                            aria-label={`${p.displayName}, ${s.code}: ${defined ? goal!.title || "definito" : "vuoto"}`}
                            className="flex min-h-12 items-center justify-center gap-1.5 px-2 hover:bg-surface"
                          >
                            {defined ? (
                              <>
                                {goal!.progress ? (
                                  <ProgressBadge progress={goal!.progress} />
                                ) : (
                                  <span className="text-xs text-subtle">Definito</span>
                                )}
                                <span
                                  aria-label={goal!.published ? "Pubblicato" : "Non pubblicato"}
                                  title={goal!.published ? "Pubblicato" : "Non pubblicato"}
                                  className={cn(
                                    "size-1.5 shrink-0 rounded-full",
                                    goal!.published
                                      ? "bg-foreground"
                                      : "border border-line-strong bg-transparent",
                                  )}
                                />
                              </>
                            ) : null}
                          </Link>
                        </Td>
                      );
                    })}
                    <Td className="text-right whitespace-nowrap">
                      <span className="mr-3 text-muted nums">
                        {summary.defined ? `${summary.published}/${summary.defined}` : "—"}
                      </span>
                      <PublishPersonButton
                        year={year}
                        profileId={p.id}
                        toPublish={summary.toPublish}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </Table>
      )}

      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-foreground" /> pubblicato
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full border border-line-strong" /> non
          ancora pubblicato
        </span>
        <span>Clic su una cella o su un nome per aprire la scheda.</span>
      </p>
    </div>
  );
}
