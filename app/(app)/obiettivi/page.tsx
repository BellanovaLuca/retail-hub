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
import { getMyWeek } from "@/lib/data/targets";
import { nowInRome, toISODate } from "@/lib/dates";
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

  const storeRows = storeTotalsRows({
    kpis: week.kpis,
    totals: week.store.totals,
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

      {week.generalComment || voiceComments.length ? (
        <section
          aria-labelledby="commento-settimana"
          className="mb-10 rounded-lg border-2 border-foreground p-5 sm:p-6"
        >
          <h2 id="commento-settimana" className="mb-3 flex items-center gap-2 eyebrow">
            <MessageSquareText className="size-4 stroke-[1.5]" aria-hidden />
            Il commento del tuo responsabile
          </h2>
          {week.generalComment ? (
            <p className="font-display text-xl leading-snug font-light whitespace-pre-line sm:text-2xl">
              {week.generalComment}
            </p>
          ) : null}
          {voiceComments.length ? (
            <dl
              className={
                week.generalComment
                  ? "mt-5 divide-y divide-line border-t border-line"
                  : "divide-y divide-line"
              }
            >
              {voiceComments.map((r) => (
                <div
                  key={r.kpiId}
                  className="grid gap-1 py-3 text-sm sm:grid-cols-[12rem_1fr] sm:gap-4"
                >
                  <dt className="font-medium">{r.label}</dt>
                  <dd className="whitespace-pre-line">{r.comment}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}

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
