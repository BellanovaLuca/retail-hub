import { format, parseISO } from "date-fns";
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
import { requireProfile } from "@/lib/auth/session";
import { getRequestDetail } from "@/lib/data/requests";
import { isOpen, type RequestStatus } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import { SwapResponse } from "../swap-response";
import { CancelButton } from "./cancel-button";

export const metadata: Metadata = { title: "Richiesta" };

export default async function RichiestaPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const r = await getRequestDetail(supabase, id);
  if (!r) notFound();
  const s = requestSummary(r);
  const mine = r.profile_id === profile.id;
  const proposedToMe = r.target_profile_id === profile.id && r.status === "pending";
  const fmt = (d: string) => format(parseISO(d), "EEE d MMM", { locale: it });

  return (
    <>
      <Link href="/richieste" className="link-underline eyebrow">
        ← Richieste
      </Link>
      <div className="mt-6">
        <PageHeader eyebrow={s.title} title={s.detail}>
          <StatusBadge status={r.status} />
        </PageHeader>
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardTitle>Dettagli</CardTitle>
            <dl className="divide-y divide-line text-sm">
              {r.type === "scambio_turno" ? (
                <>
                  <Row label="Collega">{r.targetName}</Row>
                  {r.shift ? (
                    <Row label={mine ? "Il tuo turno" : "Turno di chi chiede"}>
                      {`${fmt(r.shift.date)} · ${r.shift.text}`}
                    </Row>
                  ) : null}
                  {r.targetShift ? (
                    <Row label={mine ? "Turno del collega" : "Il tuo turno"}>
                      {`${fmt(r.targetShift.date)} · ${r.targetShift.text}`}
                    </Row>
                  ) : null}
                </>
              ) : null}
              {r.type === "cambio_turno" && r.shift ? (
                <Row label="Turno attuale">{`${fmt(r.shift.date)} · ${r.shift.text}`}</Row>
              ) : null}
              {r.message ? <Row label="Messaggio">{r.message}</Row> : null}
              {r.attachmentUrl ? (
                <Row label="Allegato">
                  <a
                    href={r.attachmentUrl}
                    className="link-underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apri
                  </a>
                </Row>
              ) : null}
              {r.decision_note ? <Row label="Nota del responsabile">{r.decision_note}</Row> : null}
            </dl>
            {mine && isOpen(r.status as RequestStatus) ? (
              <div className="mt-6">
                <CancelButton id={r.id} />
              </div>
            ) : null}
            {proposedToMe ? (
              <div className="mt-6">
                <SwapResponse id={r.id} />
              </div>
            ) : null}
          </Card>
          <Card>
            <CardTitle>Commenti</CardTitle>
            <CommentList comments={r.comments} me={profile.id} />
            <CommentForm requestId={r.id} />
          </Card>
        </div>
        <Card>
          <CardTitle>Andamento</CardTitle>
          <RequestTimeline r={r} />
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
