import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentForm } from "@/components/requests/comment-form";
import {
  CommentList,
  RequestTimeline,
  requestSummary,
  StatusBadge,
} from "@/components/requests/request-parts";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";
import { requestCoverageImpact, swapContext } from "@/lib/data/request-impact";
import { getRequestDetail, namesById } from "@/lib/data/requests";
import { awaitsAdmin, type RequestStatus } from "@/lib/requests";
import { leaveLabelAdmin } from "@/lib/schedule/view";
import { createClient } from "@/lib/supabase/server";
import { DecisionPanel } from "./decision-panel";

export const metadata: Metadata = { title: "Richiesta" };

export default async function AdminRichiestaPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const r = await getRequestDetail(supabase, id);
  if (!r) notFound();
  const s = requestSummary(r);

  // Contesto: turni di lavoro della persona in quei giorni, chi altro è assente, effetto sulla copertura.
  const to =
    r.end_date > format(addDays(parseISO(r.start_date), 31), "yyyy-MM-dd")
      ? format(addDays(parseISO(r.start_date), 31), "yyyy-MM-dd")
      : r.end_date;
  const names = await namesById(supabase);
  const [{ data: shifts }, { data: others }, impact, swap] = await Promise.all([
    supabase
      .from("shifts")
      .select("date, start_time, end_time")
      .eq("profile_id", r.profile_id)
      .gte("date", r.start_date)
      .lte("date", to)
      .order("date"),
    supabase
      .from("leaves")
      .select("profile_id, date, type, hours, status")
      .gte("date", r.start_date)
      .lte("date", to)
      .neq("profile_id", r.profile_id)
      .order("date"),
    requestCoverageImpact(supabase, r),
    r.type === "scambio_turno" ? swapContext(supabase, r, names) : null,
  ]);
  const othersByPerson = new Map<string, { days: string[]; label: string }>();
  for (const l of others ?? []) {
    const cur = othersByPerson.get(l.profile_id) ?? { days: [], label: leaveLabelAdmin(l) };
    cur.days.push(l.date);
    othersByPerson.set(l.profile_id, cur);
  }
  const fmt = (d: string) => format(parseISO(d), "EEE d", { locale: it });
  const fmtLong = (d: string) => format(parseISO(d), "EEE d MMM", { locale: it });

  return (
    <>
      <Link href="/admin/richieste" className="link-underline eyebrow">
        ← Richieste
      </Link>
      <div className="mt-6">
        <PageHeader eyebrow={`${r.requesterName} · ${s.title}`} title={s.detail}>
          <StatusBadge status={r.status} />
        </PageHeader>
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          {awaitsAdmin({ type: r.type, status: r.status as RequestStatus }) ? (
            <DecisionPanel id={r.id} type={r.type} />
          ) : null}
          <Card>
            <CardTitle>Richiesta</CardTitle>
            <dl className="divide-y divide-line text-sm">
              {r.targetName ? <Row label="Collega">{r.targetName}</Row> : null}
              {r.shift ? <Row label="Turno">{`${fmt(r.shift.date)} · ${r.shift.text}`}</Row> : null}
              {r.targetShift ? (
                <Row label="Turno del collega">{`${fmt(r.targetShift.date)} · ${r.targetShift.text}`}</Row>
              ) : null}
              {r.message ? <Row label="Messaggio">{r.message}</Row> : null}
              {r.attachmentUrl ? (
                <Row label="Allegato">
                  <a
                    href={r.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline"
                  >
                    Apri
                  </a>
                </Row>
              ) : null}
              {r.decision_note ? <Row label="Nota di decisione">{r.decision_note}</Row> : null}
            </dl>
          </Card>
          <Card>
            <CardTitle>Contesto</CardTitle>
            {swap ? (
              <>
                {swap.warnings.length ? (
                  <ul
                    role="alert"
                    className="mb-6 flex flex-col gap-1 border-l-2 border-warning pl-3 text-sm text-warning"
                  >
                    {swap.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
                <h3 className="mb-2 eyebrow">Agenda dei due colleghi nei giorni dello scambio</h3>
                <ul className="mb-6 flex flex-col gap-3 text-sm">
                  {swap.dates.map((date) => (
                    <li key={date}>
                      <span className="block capitalize nums">{fmtLong(date)}</span>
                      <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                        {swap.byDayAndPerson
                          .filter((x) => x.date === date)
                          .map((x) => (
                            <li key={x.profileId}>
                              {names.get(x.profileId)} ·{" "}
                              {x.items.length ? (
                                <span className="nums">{x.items.join(", ")}</span>
                              ) : (
                                <span className="text-muted">niente in agenda</span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <h3 className="mb-2 eyebrow">Turni di {r.requesterName} in quei giorni</h3>
            {(shifts ?? []).length ? (
              <ul className="mb-6 text-sm nums">
                {(shifts ?? []).map((sh, i) => (
                  <li key={i}>
                    <span className="capitalize">{fmt(sh.date)}</span> ·{" "}
                    {sh.start_time
                      ? `${sh.start_time.slice(0, 5)}–${sh.end_time?.slice(0, 5)}`
                      : "assenza"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-6 text-sm text-muted">Nessun turno pianificato.</p>
            )}
            <h3 className="mb-2 eyebrow">Chi altro è assente</h3>
            {othersByPerson.size ? (
              <ul className="mb-6 text-sm">
                {[...othersByPerson].map(([pid, v]) => (
                  <li key={pid}>
                    {names.get(pid)} · {v.label} ·{" "}
                    <span className="text-muted nums">{v.days.map(fmt).join(", ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-6 text-sm text-muted">Nessuno.</p>
            )}
            {impact.weeks.length ? (
              <>
                <h3 className="mb-2 eyebrow">Effetto sulla copertura</h3>
                {impact.added.length ? (
                  <ul className="flex flex-col gap-1 text-sm text-danger">
                    {impact.added.slice(0, 10).map((v, i) => (
                      <li key={i}>{v.message}</li>
                    ))}
                    {impact.added.length > 10 ? (
                      <li>… e altri {impact.added.length - 10}</li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="text-sm text-success">Nessun nuovo avviso di copertura.</p>
                )}
              </>
            ) : null}
          </Card>
          <Card>
            <CardTitle>Commenti</CardTitle>
            <CommentList comments={r.comments} me={me.id} />
            <CommentForm requestId={r.id} />
          </Card>
        </div>
        <Card>
          <CardTitle>Andamento</CardTitle>
          <RequestTimeline r={r} />
          <Link
            href={`/admin/richieste?tab=tutte&persona=${r.profile_id}`}
            className="mt-6 inline-block link-underline text-sm text-muted"
          >
            Tutte le richieste di {r.requesterName}
          </Link>
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap nums">{children}</dd>
    </div>
  );
}
