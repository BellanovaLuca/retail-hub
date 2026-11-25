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

  const people = data.people.map((p) => ({
    profileId: p.profileId,
    name: p.name,
    color: p.color,
    zone: p.zone,
    plannedHours: p.plannedHours,
    hasShifts: p.hasShifts,
  }));

  return (
    <AssignmentEditor
      // Solo la settimana: rimontando a ogni conferma si perdeva il messaggio con l'esito.
      key={weekStart}
      weekStart={weekStart}
      weekNumber={data.weekNumber}
      plannedTotal={data.plannedTotal}
      scheduleStatus={data.scheduleStatus}
      store={data.store}
      people={people}
      kpis={data.definitions
        .filter((d) => d.active)
        .map((d) => ({ kpiId: d.id, code: d.code, label: d.label, defaultTargetRule: d.rule }))}
      sets={data.sets}
      savedTargets={data.targets.map((t) => ({
        profileId: t.profileId,
        kpiId: t.kpiId,
        target: t.target,
      }))}
      comments={data.comments
        .filter((c) => c.kpiId === null)
        .map((c) => ({ profileId: c.profileId, body: c.body, published: c.published }))}
    />
  );
}
