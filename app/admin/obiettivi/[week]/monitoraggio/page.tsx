import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { Metadata } from "next";
import { StoreCard } from "@/components/targets/store-card";
import { Card, CardTitle } from "@/components/ui/card";
import { PersonDot, Table, Td, Th } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeWeekParam, weekDates } from "@/lib/data/schedule";
import { getAdminTargetsWeek, getMissingCompilers, targetsByPerson } from "@/lib/data/targets";
import { nowInRome, toISODate, weekNumber } from "@/lib/dates";
import {
  averageAchievement,
  bestPerformerAnnouncementTitle,
  performerInputs,
  storeTotalsRows,
  zoneTable,
  type ZoneTable,
} from "@/lib/kpi/monitoring";
import { formatCount } from "@/lib/kpi/sheet";
import { createClient } from "@/lib/supabase/server";
import { bestPerformer } from "@/lib/targets";
import { cn } from "@/lib/utils";
import { BestPerformerActions, RemindButton } from "./monitoring-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ week: string }>;
}): Promise<Metadata> {
  const { week } = await params;
  return { title: `Monitoraggio obiettivi · Week ${weekNumber(parseISO(week))}` };
}

/** Scheda "Monitoraggio" (§8.3). */
export default async function MonitoraggioPage({ params }: { params: Promise<{ week: string }> }) {
  await requireAdmin();
  const { week: param } = await params;
  const weekStart = normalizeWeekParam(param, nowInRome());
  const db = await createClient();
  const today = toISODate(nowInRome());
  // "Chi non ha compilato": gli ultimi due giorni della settimana scelta già trascorsi
  // (ieri e oggi nella settimana corrente; nulla nelle settimane future).
  const checkDays = weekDates(weekStart)
    .filter((d) => d <= today)
    .slice(-2);
  const [data, missing] = await Promise.all([
    getAdminTargetsWeek(db, weekStart),
    checkDays.length ? getMissingCompilers(db, checkDays) : Promise.resolve([]),
  ]);

  const names = new Map(data.people.map((p) => [p.profileId, p]));
  const targets = targetsByPerson(data.targets);
  const kpis = data.definitions
    .filter((d) => d.active)
    .map((d) => ({ kpiId: d.id, code: d.code, label: d.label }));

  // Totali del negozio (le stesse somme della vista store_weekly_totals) vs obiettivo.
  const totals: Record<string, number> = {};
  for (const e of data.entries) totals[e.kpiId] = (totals[e.kpiId] ?? 0) + e.value;
  const assigned: Record<string, number> = {};
  for (const t of data.targets) assigned[t.kpiId] = (assigned[t.kpiId] ?? 0) + t.target;
  const storeRows = storeTotalsRows({ kpis, totals, assigned, store: data.store });

  const zonePeople = data.people.map((p) => ({
    profileId: p.profileId,
    name: p.name,
    zone: p.zone,
  }));
  const tableFor = (code: string) => {
    const kpi = kpis.find((k) => k.code === code);
    if (!kpi) return null;
    return {
      kpi,
      table: zoneTable({
        people: zonePeople,
        kpiId: kpi.kpiId,
        days: data.days,
        entries: data.entries,
        targets,
        holders: new Set(
          data.people
            .filter((p) => p.kpis.some((k) => k.kpiId === kpi.kpiId))
            .map((p) => p.profileId),
        ),
      }),
    };
  };
  const meta = tableFor("META_RB_OO");
  const nuance = tableFor("NUANCE");

  const inputs = performerInputs(targets, data.entries);
  const suggested = bestPerformer(inputs);
  const ranking = inputs
    .map((p) => ({ profileId: p.profileId, avg: averageAchievement(p) }))
    .filter((p): p is { profileId: string; avg: number } => p.avg !== null)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
  const confirmedId = data.store?.bestPerformerConfirmed ? data.store.bestPerformerId : null;
  // Il best performer confermato può essere una persona poi disattivata: il nome si legge comunque.
  const confirmedName = confirmedId
    ? (names.get(confirmedId)?.name ??
      (await db.from("public_profiles").select("display_name").eq("id", confirmedId).maybeSingle())
        .data?.display_name ??
      null)
    : null;
  const candidateId = confirmedId ?? suggested?.profileId ?? null;
  const candidateName = candidateId ? (names.get(candidateId)?.name ?? "—") : null;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StoreCard
            title="Totali del negozio vs obiettivo"
            rows={storeRows}
            bestPerformerName={confirmedName}
          />
          <p className="mt-2 text-xs text-muted">
            WO e pezzi sole: obiettivo del negozio dall&apos;Assegnazione. Le altre voci: somma
            degli obiettivi assegnati alle persone.
          </p>
        </div>

        <Card className="flex flex-col gap-4">
          <CardTitle className="mb-0">Best performer</CardTitle>
          {candidateId ? (
            <>
              <div>
                <p className="font-display text-3xl font-light">{candidateName}</p>
                <p className="mt-1 text-sm text-muted">
                  {confirmedId ? "Confermato: lo vede tutto lo staff." : "Suggerito"}
                  {suggested && suggested.profileId === candidateId
                    ? ` · ${Math.round(suggested.averagePct * 100)}% medio`
                    : ""}
                </p>
              </div>
              <BestPerformerActions
                weekStart={weekStart}
                profileId={candidateId}
                confirmed={Boolean(confirmedId)}
                announcementHref={`/admin/comunicazioni/nuova?titolo=${encodeURIComponent(
                  bestPerformerAnnouncementTitle(data.weekNumber, candidateName ?? ""),
                )}`}
              />
              {ranking.length > 1 ? (
                <ol className="border-t border-line pt-3 text-sm">
                  {ranking.map((r, i) => (
                    <li key={r.profileId} className="flex justify-between py-1 nums">
                      <span className={cn(i === 0 && "font-medium")}>
                        {i + 1}. {names.get(r.profileId)?.name ?? "—"}
                      </span>
                      <span className="text-muted">{Math.round(r.avg * 100)}%</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-subtle">
              Nessun suggerimento: servono obiettivi assegnati e numeri inseriti.
            </p>
          )}
        </Card>
      </div>

      {meta ? (
        <PersonTable title={meta.kpi.label} table={meta.table} days={data.days} today={today} />
      ) : null}
      {nuance ? (
        <PersonTable title={nuance.kpi.label} table={nuance.table} days={data.days} today={today} />
      ) : null}

      <Card>
        <CardTitle>Chi non ha compilato</CardTitle>
        <p className="mb-4 text-sm text-muted">
          Persone in turno (turni pubblicati) che non hanno ancora salvato i numeri della giornata.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          {missing.map((m) => {
            const label = m.date === today ? "Oggi" : "Ieri";
            return (
              <div key={m.date}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {label}{" "}
                    <span className="text-muted">
                      · {format(parseISO(m.date), "EEE d MMM", { locale: it })}
                    </span>
                  </h3>
                  {m.profileIds.length ? (
                    <RemindButton profileIds={m.profileIds} date={m.date} />
                  ) : null}
                </div>
                {m.profileIds.length === 0 ? (
                  <p className="text-sm text-subtle">Tutti a posto.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line border-y border-line">
                    {m.profileIds.map((id) => (
                      <li key={id} className="flex min-h-10 items-center gap-2 text-sm">
                        <PersonDot color={names.get(id)?.color ?? null} />
                        {names.get(id)?.name ?? "Persona non attiva"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function PersonTable({
  title,
  table,
  days,
  today,
}: {
  title: string;
  table: ZoneTable;
  days: string[];
  today: string;
}) {
  return (
    <section aria-label={`Tabella ${title}`}>
      <h2 className="mb-3 eyebrow">{title} per persona</h2>
      {table.groups.length === 0 ? (
        <p className="text-sm text-subtle">Nessuno ha questa voce.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Persona</Th>
              {days.map((d) => (
                <Th
                  key={d}
                  className={cn("text-right", d === today && "border-t-[3px] border-t-foreground")}
                >
                  {format(parseISO(d), "EEE d", { locale: it })}
                </Th>
              ))}
              <Th className="text-right">Totale</Th>
              <Th className="text-right">Obiettivo</Th>
            </tr>
          </thead>
          {table.groups.map((g) => (
            <tbody key={g.zone}>
              <tr>
                <td
                  colSpan={days.length + 3}
                  className={cn(
                    "px-2 py-1.5 eyebrow",
                    g.zone === "vista" ? "bg-vista/10" : "bg-sole/10",
                  )}
                >
                  {g.label}
                </td>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.profileId}>
                  <Td>{r.name}</Td>
                  {days.map((d) => (
                    <Td key={d} className="text-right text-muted">
                      {r.values[d] ? formatCount(r.values[d]) : "·"}
                    </Td>
                  ))}
                  <Td className="text-right font-medium">{formatCount(r.total)}</Td>
                  <Td className="text-right text-muted">
                    {r.target === null ? "—" : formatCount(r.target)}
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="font-medium">Totale {g.label}</Td>
                {days.map((d) => (
                  <Td key={d} />
                ))}
                <Td className="text-right font-medium">{formatCount(g.total)}</Td>
                <Td className="text-right text-muted">{formatCount(g.target)}</Td>
              </tr>
            </tbody>
          ))}
          <tfoot>
            <tr>
              <Td className="font-semibold">Totale negozio</Td>
              {days.map((d) => (
                <Td key={d} />
              ))}
              <Td className="text-right font-semibold">{formatCount(table.total)}</Td>
              <Td className="text-right">{formatCount(table.target)}</Td>
            </tr>
          </tfoot>
        </Table>
      )}
    </section>
  );
}
