import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getSchedulePeople } from "@/lib/data/schedule";
import { getKpiDefinitions, getKpiSets, getPeopleKpis } from "@/lib/data/targets";
import { createClient } from "@/lib/supabase/server";
import { KpiManager } from "./kpi-manager";

export const metadata: Metadata = { title: "Voci degli obiettivi" };

/** Scheda "Voci": voci (KPI), gruppi Vista / Sole e voci per singola persona (§8.3). */
export default async function VociPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  await requireAdmin();
  const { persona } = await searchParams;
  const db = await createClient();
  const [definitions, sets, people] = await Promise.all([
    getKpiDefinitions(db),
    getKpiSets(db),
    getSchedulePeople(db),
  ]);
  const kpisByPerson = await getPeopleKpis(
    db,
    people.map((p) => ({ id: p.id, zone: p.homeZone })),
    definitions,
    sets,
  );

  return (
    <KpiManager
      definitions={definitions}
      sets={sets}
      initialPersonId={persona ?? people[0]?.id ?? null}
      people={people.map((p) => ({
        id: p.id,
        name: p.displayName,
        zone: p.homeZone,
        kpis: (kpisByPerson.get(p.id) ?? []).map((k) => ({
          kpiId: k.kpiId,
          label: k.label,
          labelOverride: k.labelOverride,
          fromGroup: k.fromGroup,
        })),
      }))}
    />
  );
}
