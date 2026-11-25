import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StoreCard } from "@/components/targets/store-card";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { getMyWeek, getWeekComments } from "@/lib/data/targets";
import { nowInRome, toISODate, weekNumber } from "@/lib/dates";
import { storeTotalsRows } from "@/lib/kpi/monitoring";
import { createClient } from "@/lib/supabase/server";
import { MyNote } from "./my-note";
import { MyWeek } from "./my-week";

export const metadata: Metadata = { title: "Obiettivi" };

export default async function ObiettiviPage({
  searchParams,
}: {
  searchParams: Promise<{ settimana?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const now = nowInRome();
  const current = normalizeWeekParam(undefined, now);
  // Si guardano la settimana corrente, le precedenti e la prossima: gli obiettivi arrivano
  // prima del lunedì e la notifica porta qui.
  const nextWeek = toISODate(addDays(parseISO(current), 7));
  const requested = normalizeWeekParam(params.settimana, now);
  const weekStart = requested > nextWeek ? nextWeek : requested;

  const supabase = await createClient();
  const week = await getMyWeek(supabase, profile, weekStart);
  const prev = toISODate(addDays(parseISO(weekStart), -7));
  const next = toISODate(addDays(parseISO(weekStart), 7));
  const isCurrent = weekStart === current;
  const canGoNext = weekStart < nextWeek;

  const initialValues: Record<string, number | null> = {};
  for (const row of week.rows)
    for (const [date, v] of Object.entries(row.values))
      if (v !== null) initialValues[`${row.kpiId}|${date}`] = v;

  const voiceComments = week.rows.filter((r) => r.comment);

  // Commenti pubblicati sulla settimana precedente a quella mostrata.
  const labelOf = (kpiId: string) =>
    week.rows.find((r) => r.kpiId === kpiId)?.label ??
    week.kpis.find((k) => k.kpiId === kpiId)?.label ??
    "Voce";
  const previousComments = (await getWeekComments(supabase, prev, profile.id)).filter(
    (c) => c.published && c.body.trim(),
  );
  const previous = {
    general: previousComments.find((c) => c.kpiId === null)?.body ?? null,
    voices: previousComments
      .filter((c) => c.kpiId !== null)
      .map((c) => ({ kpiId: c.kpiId!, label: labelOf(c.kpiId!), body: c.body })),
  };

  const storeRows = storeTotalsRows({
    kpis: week.kpis,
    totals: week.store.totals,
    // META, NUANCE…: obiettivo = somma di quelli assegnati in negozio (nessun dato per persona).
    assigned: week.store.assigned,
    store: week.store.targets,
    headlineOnly: true,
  });

  return (
    <>
      <header className="mb-8 flex flex-col gap-3 sm:mb-12">
        <p className="eyebrow">Obiettivi individuali</p>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Settimana precedente">
            <Link href={`/obiettivi?settimana=${prev}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h1 className="font-display text-4xl font-light tracking-tight nums sm:text-[2.75rem]">
            Week {week.weekNumber}
          </h1>
          {canGoNext ? (
            <Button asChild variant="ghost" size="icon" aria-label="Settimana successiva">
              <Link href={`/obiettivi?settimana=${next}`}>
                <ChevronRight />
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-3 text-sm text-muted nums">
          {format(parseISO(week.days[0]), "d MMM", { locale: it })} –{" "}
          {format(parseISO(week.days[6]), "d MMM", { locale: it })}
          {!isCurrent ? (
            <Link href="/obiettivi" className="link-underline eyebrow text-foreground">
              Torna a questa settimana
            </Link>
          ) : null}
        </p>
      </header>

      {/* Sempre per primo il commento settimanale del responsabile: quello di questa settimana
          e, sotto, quello sulla settimana appena trascorsa. */}
      <section
        aria-labelledby="commento-settimanale"
        className="mb-8 rounded-lg border-2 border-foreground p-5 sm:p-6"
      >
        <h2 id="commento-settimanale" className="mb-3 flex items-center gap-2 eyebrow">
          <MessageSquareText className="size-4 stroke-[1.5]" aria-hidden />
          Commento settimanale · Week {week.weekNumber}
        </h2>
        {week.generalComment || voiceComments.length ? (
          <CommentBody
            general={week.generalComment}
            voices={voiceComments.map((r) => ({
              kpiId: r.kpiId,
              label: r.label,
              body: r.comment,
            }))}
          />
        ) : (
          <p className="font-display text-xl font-light text-subtle">
            {isCurrent
              ? "Il responsabile non ha ancora scritto il commento di questa settimana."
              : "Nessun commento del responsabile per questa settimana."}
          </p>
        )}
        {previous.general || previous.voices.length ? (
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="mb-2 eyebrow">
              Settimana trascorsa · Week {weekNumber(parseISO(prev))}
            </h3>
            <CommentBody general={previous.general} voices={previous.voices} small />
            <p className="mt-3 text-sm">
              <Link href={`/obiettivi?settimana=${prev}`} className="link-underline text-muted">
                Vedi i numeri di quella settimana
              </Link>
            </p>
          </div>
        ) : null}
      </section>

      {week.rows.length === 0 ? (
        <p className="py-12 font-display text-2xl font-light text-subtle">
          Non hai ancora voci da compilare: chiedi a un responsabile di assegnartele.
        </p>
      ) : (
        <MyWeek
          key={weekStart}
          days={week.days}
          today={week.today}
          kpis={week.rows.map((r) => ({ kpiId: r.kpiId, code: r.code, label: r.label }))}
          targets={Object.fromEntries(
            week.rows.filter((r) => r.target !== null).map((r) => [r.kpiId, r.target!]),
          )}
          comments={Object.fromEntries(
            week.rows.filter((r) => r.comment).map((r) => [r.kpiId, r.comment]),
          )}
          initialValues={initialValues}
        />
      )}

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>La mia nota</CardTitle>
          <MyNote key={weekStart} weekStart={weekStart} initialValue={week.note} />
        </Card>
        <StoreCard rows={storeRows} bestPerformerName={week.store.bestPerformerName} />
      </div>
    </>
  );
}

/** Testo del commento del responsabile: generale e sulle singole voci. */
function CommentBody({
  general,
  voices,
  small,
}: {
  general: string | null;
  voices: { kpiId: string; label: string; body: string }[];
  /** Carattere più piccolo (commento della settimana trascorsa). */
  small?: boolean;
}) {
  return (
    <>
      {general ? (
        <p
          className={
            small
              ? "text-base leading-relaxed whitespace-pre-line"
              : "font-display text-xl leading-snug font-light whitespace-pre-line sm:text-2xl"
          }
        >
          {general}
        </p>
      ) : null}
      {voices.length ? (
        <dl
          className={
            general ? "mt-4 divide-y divide-line border-t border-line" : "divide-y divide-line"
          }
        >
          {voices.map((v) => (
            <div
              key={v.kpiId}
              className="grid gap-1 py-3 text-sm sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt className="font-medium">{v.label}</dt>
              <dd className="whitespace-pre-line">{v.body}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}
