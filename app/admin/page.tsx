import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminAnnouncements } from "@/lib/data/announcements";
import { namesById } from "@/lib/data/requests";
import { evaluateWeek, installStandardRuleSet } from "@/lib/data/rules";
import { formatLong, nowInRome, toISODate, weekNumber, weekStart } from "@/lib/dates";
import { awaitsAdmin, type RequestStatus } from "@/lib/requests";
import { leaveLabelAdmin } from "@/lib/schedule/view";
import { createClient } from "@/lib/supabase/server";
import { RequestsTable } from "./richieste/requests-table";

export const metadata: Metadata = { title: "Cruscotto" };

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  await installStandardRuleSet(supabase);
  const now = nowInRome();
  const today = toISODate(now);
  const tomorrow = toISODate(addDays(now, 1));
  const monday = weekStart(now);
  const nextWeeks = [1, 2, 3].map((i) => format(addDays(monday, 7 * i), "yyyy-MM-dd"));
  const coverageWeeks = [0, 1].map((i) => format(addDays(monday, 7 * i), "yyyy-MM-dd"));

  const [
    { data: pending },
    names,
    { data: weeks },
    announcements,
    { data: absences },
    { count: activePeople },
    ...evaluations
  ] = await Promise.all([
    supabase
      .from("requests")
      .select("*")
      .in("status", ["pending", "peer_accepted"])
      .order("start_date")
      .limit(50),
    namesById(supabase),
    supabase.from("schedule_weeks").select("week_start, status").in("week_start", nextWeeks),
    getAdminAnnouncements(supabase),
    supabase
      .from("leaves")
      .select("profile_id, date, type, hours, status")
      .in("date", [today, tomorrow])
      .order("date"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
    ...coverageWeeks.map((w) => evaluateWeek(supabase, w)),
  ]);

  const decidable = (pending ?? []).filter((r) =>
    awaitsAdmin({ type: r.type, status: r.status as RequestStatus }),
  );
  const unpublished = nextWeeks.filter(
    (w) => weeks?.find((x) => x.week_start === w)?.status !== "published",
  );
  const holes = evaluations.flatMap((e, i) =>
    e.violations
      // Solo da oggi in avanti: i giorni passati non si possono più coprire.
      .filter((v) => v.severity === "warning" && v.date && v.date >= today && !v.profileId)
      .map((v) => ({ week: coverageWeeks[i], message: v.message })),
  );
  const ackMissing = announcements
    .filter((a) => a.status === "live" && a.requiresAck && a.ackCount < a.recipients.length)
    .map((a) => ({
      id: a.id,
      title: a.title,
      missing: a.recipients.filter((r) => !r.acknowledgedAt).map((r) => r.name),
    }));
  const awayOn = (d: string) => (absences ?? []).filter((l) => l.date === d);

  return (
    <>
      <PageHeader eyebrow={formatLong(now)} title="Cruscotto" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle>
            Richieste in attesa{" "}
            {decidable.length ? <Badge tone="warning">{decidable.length}</Badge> : null}
          </CardTitle>
          {decidable.length ? (
            <RequestsTable
              selectable
              rows={decidable.slice(0, 8).map((r) => ({
                id: r.id,
                person: names.get(r.profile_id) ?? "—",
                target: r.target_profile_id ? (names.get(r.target_profile_id) ?? "—") : null,
                type: r.type,
                startDate: r.start_date,
                endDate: r.end_date,
                startTime: r.start_time,
                endTime: r.end_time,
                hours: r.hours,
                recurring: r.recurring_weekdays,
                status: r.status as RequestStatus,
                message: r.message,
                createdAt: r.created_at,
                decidable: true,
              }))}
            />
          ) : (
            <p className="text-sm text-muted">Nessuna richiesta da decidere.</p>
          )}
          {decidable.length > 8 ? (
            <Link href="/admin/richieste" className="mt-4 inline-block link-underline text-sm">
              Tutte le richieste in attesa
            </Link>
          ) : null}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardTitle>Settimane da pubblicare</CardTitle>
            {unpublished.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {unpublished.map((w) => (
                  <li key={w}>
                    <Link
                      href={`/admin/turni/${w}`}
                      className="flex items-center justify-between hover:underline"
                    >
                      <span>
                        Week {weekNumber(parseISO(w))} ·{" "}
                        <span className="text-muted">
                          {format(parseISO(w), "d MMM", { locale: it })}
                        </span>
                      </span>
                      <ArrowRight className="size-3.5 stroke-[1.5]" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-success">Le prossime tre settimane sono pubblicate.</p>
            )}
          </Card>

          <Card>
            <CardTitle>Assenti</CardTitle>
            {[
              ["Oggi", today],
              ["Domani", tomorrow],
            ].map(([label, d]) => (
              <div key={d} className="mb-3 last:mb-0">
                <p className="mb-1 eyebrow">{label}</p>
                {awayOn(d).length ? (
                  <ul className="text-sm">
                    {awayOn(d).map((l) => (
                      <li key={l.profile_id}>
                        {names.get(l.profile_id)} ·{" "}
                        <span className="text-muted">{leaveLabelAdmin(l)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Nessuno.</p>
                )}
              </div>
            ))}
          </Card>
        </div>

        <Card className="xl:col-span-2">
          <CardTitle>
            Buchi di copertura · prossime 2 settimane{" "}
            {holes.length ? <Badge tone="danger">{holes.length}</Badge> : null}
          </CardTitle>
          {(activePeople ?? 0) <= 1 ? (
            <p className="text-sm text-muted">
              Aggiungi il personale da{" "}
              <Link href="/admin/dipendenti/nuovo" className="link-underline">
                Dipendenti
              </Link>
              : i buchi si calcolano sui turni delle persone.
            </p>
          ) : holes.length ? (
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto text-sm text-danger">
              {holes.slice(0, 30).map((h, i) => (
                <li key={i}>
                  <Link href={`/admin/turni/${h.week}`} className="hover:underline">
                    {h.message}
                  </Link>
                </li>
              ))}
              {holes.length > 30 ? (
                <li className="text-muted">… e altri {holes.length - 30}</li>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm text-success">Nessun buco di copertura con le regole attive.</p>
          )}
        </Card>

        <Card>
          <CardTitle>Conferme di lettura mancanti</CardTitle>
          {ackMissing.length ? (
            <ul className="flex flex-col gap-3 text-sm">
              {ackMissing.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/admin/comunicazioni/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.title}
                  </Link>
                  <p className="text-muted">
                    {a.missing.length} {a.missing.length === 1 ? "persona" : "persone"}:{" "}
                    {a.missing.slice(0, 6).join(", ")}
                    {a.missing.length > 6 ? "…" : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nessuna conferma in sospeso.</p>
          )}
        </Card>
      </div>
    </>
  );
}
