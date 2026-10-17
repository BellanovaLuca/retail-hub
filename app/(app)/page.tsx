import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requestSummary, StatusBadge } from "@/components/requests/request-parts";
import { TodayDutiesList } from "@/components/responsibilities/today-duties";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { requireProfile } from "@/lib/auth/session";
import { getUnreadAnnouncements } from "@/lib/data/announcements";
import { getTodayDuties } from "@/lib/data/responsibilities";
import { getPublicPeople, getPublishedShifts, weekDates } from "@/lib/data/schedule";
import { formatLong, nowInRome, toISODate, weekNumber, weekStart } from "@/lib/dates";
import { shiftNetHours } from "@/lib/hours";
import { groupLeavePeriods } from "@/lib/leaves/plan";
import { publishedDayText } from "@/lib/schedule/cells";
import type { PublishedShift } from "@/lib/schedule/types";
import { formatHoursIt } from "@/lib/schedule/view";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Countdown } from "./countdown";
import { WeekTargetsCard } from "./week-targets-card";

function greeting(hour: number) {
  if (hour < 13) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

const hours = (list: PublishedShift[]) =>
  list
    .filter((s) => s.start_time && s.end_time)
    .reduce(
      (n, s) =>
        n +
        shiftNetHours({ start: s.start_time!, end: s.end_time!, breakMinutes: s.break_minutes }),
      0,
    );

function dayWord(date: string, today: string) {
  const diff = differenceInCalendarDays(parseISO(date), parseISO(today));
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  const s = format(parseISO(date), "EEEE d MMMM", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const now = nowInRome();
  const today = toISODate(now);
  const nowTime = format(now, "HH:mm");
  const monday = toISODate(weekStart(now));
  const days = weekDates(monday);
  const horizon = toISODate(addDays(now, 21));

  const [published, people, unread, duties, { data: requests }, { data: leaves }] =
    await Promise.all([
      getPublishedShifts(supabase, days[0], horizon),
      getPublicPeople(supabase),
      getUnreadAnnouncements(supabase, profile.id),
      getTodayDuties(supabase, profile.id, today),
      supabase
        .from("requests")
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("leaves")
        .select("date, type, status, hours")
        .eq("profile_id", profile.id)
        .gte("date", today)
        .order("date")
        .limit(60),
    ]);

  const mine = published.filter((s) => s.profile_id === profile.id);
  const byDate = (d: string) => mine.filter((s) => s.date === d);
  const next = [...new Set(mine.filter((s) => !s.is_absence && s.start_time).map((s) => s.date))]
    .sort()
    .find((d) => d > today || (d === today && byDate(d).some((s) => (s.end_time ?? "") > nowTime)));
  const nextShifts = next ? byDate(next).filter((s) => !s.is_absence) : [];
  const nextStart = nextShifts.map((s) => s.start_time!).sort()[0];
  const weekShifts = mine.filter((s) => s.date >= days[0] && s.date <= days[6]);
  const names = new Map(people.map((p) => [p.id, p.displayName]));
  const todayTeam = [
    ...new Map(
      published
        .filter((s) => s.date === today && !s.is_absence && s.start_time)
        .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
        .map((s) => [s.profile_id, s]),
    ).values(),
  ];
  const vacations = groupLeavePeriods((leaves ?? []).filter((l) => l.type === "ferie")).slice(0, 2);

  return (
    <>
      <PageHeader
        eyebrow={formatLong(now)}
        title={`${greeting(now.getHours())}, ${profile.display_name}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Prossimo turno</CardTitle>
          {next ? (
            <>
              <p className="font-display text-4xl font-light tracking-tight sm:text-5xl">
                {dayWord(next, today)} ·{" "}
                <span className="nums">{publishedDayText(nextShifts)}</span>
              </p>
              {next === today && nextStart ? <Countdown date={next} start={nextStart} /> : null}
              {nextShifts[0]?.zone ? (
                <p className="mt-2 text-sm text-muted">
                  {nextShifts[0].zone === "vista" ? "Vista" : "Sole"}
                  {nextShifts.some((s) => s.is_back_office) ? " · back office" : ""}
                </p>
              ) : null}
            </>
          ) : (
            <p className="font-display text-2xl font-light text-subtle">
              Nessun turno pubblicato nelle prossime settimane.
            </p>
          )}
          <Link
            href="/orari"
            className="mt-6 inline-flex items-center gap-1 link-underline text-sm"
          >
            I miei orari <ArrowRight className="size-3.5 stroke-[1.5]" aria-hidden />
          </Link>
        </Card>

        <Card>
          <CardTitle>Ore della settimana</CardTitle>
          <p className="font-display text-4xl font-light nums">
            {formatHoursIt(hours(weekShifts))}
            <span className="text-2xl text-subtle">
              {" "}
              / {profile.weekly_hours != null ? formatHoursIt(profile.weekly_hours) : "—"} h
            </span>
          </p>
          <p className="mt-2 text-xs text-muted">Pianificate · di contratto</p>
        </Card>

        <Card className="lg:col-span-3">
          <CardTitle>La mia settimana · Week {weekNumber(now)}</CardTitle>
          <ol className="grid grid-cols-7 gap-1.5 sm:gap-3">
            {days.map((d) => {
              const list = byDate(d);
              const text = publishedDayText(list);
              const isToday = d === today;
              return (
                <li
                  key={d}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "flex min-h-20 flex-col justify-between gap-1 border border-line p-1.5 sm:min-h-24 sm:p-3",
                    isToday && "border-t-[3px] border-t-foreground",
                    !text && "text-subtle",
                  )}
                >
                  <span className="eyebrow text-[0.625rem] capitalize sm:text-[0.6875rem]">
                    {format(parseISO(d), "EEE d", { locale: it })}
                  </span>
                  <span className="text-[0.6875rem] leading-tight nums sm:text-sm">
                    {text || "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Oggi tocca a te</CardTitle>
          {duties.responsibilities.length || duties.extraTasks.length ? (
            <TodayDutiesList duties={duties} viewerName={profile.display_name} compact />
          ) : (
            <p className="text-sm text-muted">Nessuna responsabilità per te oggi.</p>
          )}
        </Card>

        <Card>
          <CardTitle>
            Comunicazioni {unread.count ? <Badge tone="solid">{unread.count}</Badge> : null}
          </CardTitle>
          {unread.items.length ? (
            <ul className="flex flex-col gap-3">
              {unread.items.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="group block">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {a.category === "urgente" ? <Badge tone="danger">Urgente</Badge> : null}
                      {a.requiresAck ? <Badge tone="warning">Da confermare</Badge> : null}
                    </span>
                    <span className="mt-1 block text-sm group-hover:underline">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sei in pari.</p>
          )}
          <Link href="/comunicazioni" className="mt-4 inline-block link-underline text-sm">
            Bacheca
          </Link>
        </Card>

        <WeekTargetsCard profileId={profile.id} weekStart={monday} />

        <Card>
          <CardTitle>Le mie richieste</CardTitle>
          {(requests ?? []).length ? (
            <ul className="flex flex-col gap-3">
              {(requests ?? []).map((r) => {
                const s = requestSummary(r);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/richieste/${r.id}`}
                      className="flex items-center justify-between gap-2 text-sm hover:underline"
                    >
                      <span>
                        {s.title} · <span className="text-muted nums">{s.detail}</span>
                      </span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nessuna richiesta.</p>
          )}
          <Link href="/richieste/nuova" className="mt-4 inline-block link-underline text-sm">
            Nuova richiesta
          </Link>
        </Card>

        <Card>
          <CardTitle>Prossime ferie</CardTitle>
          {vacations.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {vacations.map((p) => (
                <li key={p.from} className="flex items-center gap-2">
                  <span className="nums">
                    {format(parseISO(p.from), "d MMM", { locale: it })}
                    {p.to !== p.from ? ` – ${format(parseISO(p.to), "d MMM", { locale: it })}` : ""}
                  </span>
                  {p.status === "tentative" ? <Badge tone="warning">Da confermare</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nessuna ferie in programma.</p>
          )}
          <Link href="/ferie" className="mt-4 inline-block link-underline text-sm">
            Planning ferie
          </Link>
        </Card>

        <Card>
          <CardTitle>In turno oggi</CardTitle>
          {todayTeam.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {todayTeam.map((s) => (
                <li
                  key={s.profile_id}
                  className={cn(
                    "flex justify-between gap-2",
                    s.profile_id === profile.id && "font-medium",
                  )}
                >
                  <span>{names.get(s.profile_id) ?? "—"}</span>
                  <span className="text-muted nums">
                    {publishedDayText(
                      published.filter((x) => x.profile_id === s.profile_id && x.date === today),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nessun turno pubblicato per oggi.</p>
          )}
        </Card>
      </div>
    </>
  );
}
