import { parseISO } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { PersonDot } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { getAdminTargetsWeek, targetsByPerson } from "@/lib/data/targets";
import { nowInRome, weekNumber } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PersonPicker } from "./person-picker";
import { PersonSheetEditor } from "./person-sheet-editor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  return { title: `Obiettivi per persona · Week ${weekNumber(parseISO(week))}` };
}

/** Scheda "Persone": il foglio della settimana di ciascuno, con i commenti (§8.3). */
export default async function PersonePage({
  params,
  searchParams,
}: {
  params: Promise<{ week: string }>;
  searchParams: Promise<{ persona?: string }>;
}) {
  await requireAdmin();
  const { week: param } = await params;
  const { persona } = await searchParams;
  const weekStart = normalizeWeekParam(param, nowInRome());
  const data = await getAdminTargetsWeek(await createClient(), weekStart);

  const targets = targetsByPerson(data.targets);
  const withData = new Set([
    ...data.targets.map((t) => t.profileId),
    ...data.entries.map((e) => e.profileId!),
  ]);
  // Prima chi ha obiettivi o numeri in settimana, poi gli altri.
  const people = [...data.people].sort(
    (a, b) => Number(withData.has(b.profileId)) - Number(withData.has(a.profileId)),
  );
  const selected = people.find((p) => p.profileId === persona) ?? people[0];
  const base = `/admin/obiettivi/${weekStart}/persone`;

  if (!selected) {
    return (
      <p className="py-12 font-display text-2xl font-light text-subtle">Nessuna persona attiva.</p>
    );
  }

  const comments = data.comments.filter((c) => c.profileId === selected.profileId);
  const kpis = selected.kpis.map((k) => ({ kpiId: k.kpiId, code: k.code, label: k.label }));
  // Voci con obiettivo o numeri ma tolte dal foglio: restano visibili per non perdere nulla.
  for (const kpiId of new Set([
    ...Object.keys(targets[selected.profileId] ?? {}),
    ...data.entries.filter((e) => e.profileId === selected.profileId).map((e) => e.kpiId),
  ])) {
    if (kpis.some((k) => k.kpiId === kpiId)) continue;
    const d = data.definitions.find((x) => x.id === kpiId);
    if (d) kpis.push({ kpiId: d.id, code: d.code, label: d.label });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Persone" className="hidden lg:block">
        <ul className="flex flex-col border-t border-line">
          {people.map((p) => {
            const active = p.profileId === selected.profileId;
            const unpublished = data.comments.some(
              (c) => c.profileId === p.profileId && !c.published && c.body,
            );
            return (
              <li key={p.profileId}>
                <Link
                  href={`${base}?persona=${p.profileId}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2 border-b border-line px-2 text-sm",
                    active ? "bg-foreground text-background" : "hover:bg-surface",
                    !withData.has(p.profileId) && !active && "text-muted",
                  )}
                >
                  <PersonDot color={p.color} />
                  <span className="truncate">{p.name}</span>
                  {unpublished ? (
                    <span
                      className={cn(
                        "ml-auto size-1.5 shrink-0 rounded-full",
                        active ? "bg-background" : "bg-warning",
                      )}
                      title="Commenti da pubblicare"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">
        <div className="mb-6 lg:hidden">
          <PersonPicker
            base={base}
            value={selected.profileId}
            people={people.map((p) => ({ id: p.profileId, name: p.name }))}
          />
        </div>
        <PersonSheetEditor
          key={`${selected.profileId}-${weekStart}`}
          profileId={selected.profileId}
          name={selected.name}
          zone={selected.zone}
          weekStart={weekStart}
          days={data.days}
          today={data.today}
          kpis={kpis}
          targets={targets[selected.profileId] ?? {}}
          entries={data.entries.filter((e) => e.profileId === selected.profileId)}
          comments={comments.map((c) => ({
            kpiId: c.kpiId,
            body: c.body,
            published: c.published,
          }))}
          note={data.notes[selected.profileId] ?? ""}
        />
      </div>
    </div>
  );
}
