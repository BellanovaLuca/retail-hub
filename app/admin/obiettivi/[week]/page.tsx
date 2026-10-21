import { parseISO } from "date-fns";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { getAdminTargetsWeek } from "@/lib/data/targets";
import { nowInRome, weekNumber } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { AssignmentEditor } from "./assignment-editor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  return { title: `Obiettivi · Week ${weekNumber(parseISO(week))}` };
}

/** Scheda "Assegnazione" (foglio "Assegnazione obiettivi", §8.3). */
export default async function AssegnazionePage({ params }: { params: Promise<{ week: string }> }) {
  await requireAdmin();
  const { week: param } = await params;
  const weekStart = normalizeWeekParam(param, nowInRome());
  const data = await getAdminTargetsWeek(await createClient(), weekStart);

  // In anteprima tutte le persone attive: chi ha ore in vendita riceve la proposta calcolata,
  // gli altri (nessun turno o solo back office) restano in elenco per scrivere gli obiettivi a mano.
  const withTargets = new Set(data.targets.map((t) => t.profileId));
  const people = data.people.map((p) => ({
    profileId: p.profileId,
    name: p.name,
    color: p.color,
    zone: p.zone,
    plannedHours: p.plannedHours,
    hasShifts: p.hasShifts,
    kpis: p.kpis.map((k) => ({ kpiId: k.kpiId, code: k.code, label: k.label })),
  }));
  const withoutHours = data.people
    .filter((p) => p.plannedHours === 0 && !withTargets.has(p.profileId))
    .map((p) => p.name);

  return (
    <AssignmentEditor
      key={`${weekStart}-${data.store?.confirmedAt ?? "new"}`}
      weekStart={weekStart}
      weekNumber={data.weekNumber}
      plannedTotal={data.plannedTotal}
      scheduleStatus={data.scheduleStatus}
      store={data.store}
      people={people}
      kpis={data.definitions
        .filter((d) => d.active)
        .map((d) => ({ kpiId: d.id, code: d.code, label: d.label, defaultTargetRule: d.rule }))}
      savedTargets={data.targets}
      withoutHours={withoutHours}
    />
  );
}
