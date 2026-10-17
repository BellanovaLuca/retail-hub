import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { requireProfile } from "@/lib/auth/session";
import {
  getPublicPeople,
  getPublishedShifts,
  normalizeWeekParam,
  weekDates,
} from "@/lib/data/schedule";
import { nowInRome, toISODate, weekNumber } from "@/lib/dates";
import { shiftNetHours } from "@/lib/hours";
import { publishedDayText } from "@/lib/schedule/cells";
import type { PublishedShift } from "@/lib/schedule/types";
import { formatHoursIt, leaveLabelAdmin } from "@/lib/schedule/view";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CalendarFeed } from "./calendar-feed";
import { MonthCalendar } from "./month-calendar";

export const metadata: Metadata = { title: "I miei orari" };

function dayHours(list: PublishedShift[]) {
  return list
    .filter((s) => s.start_time && s.end_time)
    .reduce(
      (sum, s) =>
        sum +
        shiftNetHours({ start: s.start_time!, end: s.end_time!, breakMinutes: s.break_minutes }),
      0,
    );
}

export default async function OrariPage({
  searchParams,
}: {
  searchParams: Promise<{ settimana?: string; vista?: string; mese?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();
  const now = nowInRome();
  const today = toISODate(now);
  const view = params.vista === "mese" ? "mese" : "settimana";

  const tabs = (
    <SubNav
      items={[
        { href: "/orari", label: "I miei orari" },
        { href: "/orari/negozio", label: "Griglia del negozio" },
      ]}
      exact={["/orari"]}
    />
  );

  if (view === "mese") {
    const month =
      params.mese && /^\d{4}-\d{2}$/.test(params.mese)
        ? parseISO(`${params.mese}-01`)
        : startOfMonth(now);
    const from = toISODate(startOfMonth(month));
    const to = toISODate(endOfMonth(month));
    const [mine, { data: leaves }] = await Promise.all([
      getPublishedShifts(supabase, from, to, profile.id),
      supabase
        .from("leaves")
        .select("date, type, hours, status")
        .eq("profile_id", profile.id)
        .gte("date", from)
        .lte("date", to),
    ]);
    const total = dayHours(mine);
    return (
      <>
        <PageHeader eyebrow="Orari" title={format(month, "MMMM yyyy", { locale: it })}>
          <span className="nums">{formatHoursIt(total)} ore pianificate</span>
        </PageHeader>
        {tabs}
        <ViewSwitch view="mese" />
        <div className="mb-6 flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Mese precedente">
            <Link href={`/orari?vista=mese&mese=${format(addMonths(month, -1), "yyyy-MM")}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Mese successivo">
            <Link href={`/orari?vista=mese&mese=${format(addMonths(month, 1), "yyyy-MM")}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <MonthCalendar
          month={format(month, "yyyy-MM")}
          today={today}
          days={Object.fromEntries(
            [...new Set(mine.map((s) => s.date))].map((d) => [
              d,
              {
                text: publishedDayText(mine.filter((s) => s.date === d)),
                changed: mine.some((s) => s.date === d && s.changed),
              },
            ]),
          )}
          leaves={Object.fromEntries((leaves ?? []).map((l) => [l.date, leaveLabelAdmin(l)]))}
        />
        <CalendarFeed token={profile.ical_token} />
      </>
    );
  }

  const weekStart = normalizeWeekParam(params.settimana, now);
  const days = weekDates(weekStart);
  const [all, people, { data: myLeaves }, { data: week }] = await Promise.all([
    getPublishedShifts(supabase, days[0], days[6]),
    getPublicPeople(supabase),
    supabase
      .from("leaves")
      .select("date, type, hours, status")
      .eq("profile_id", profile.id)
      .gte("date", days[0])
      .lte("date", days[6]),
    supabase
      .from("published_weeks")
      .select("note, status, published_at")
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);
  const names = new Map(people.map((p) => [p.id, p.displayName]));
  const mine = all.filter((s) => s.profile_id === profile.id);
  const leaveByDate = new Map((myLeaves ?? []).map((l) => [l.date, l]));
  const total = dayHours(mine);
  const prev = toISODate(addDays(parseISO(weekStart), -7));
  const next = toISODate(addDays(parseISO(weekStart), 7));
  const published = week?.status === "published";

  return (
    <>
      <PageHeader eyebrow={`Week ${weekNumber(parseISO(weekStart))}`} title="I miei orari">
        <span className="nums">
          {formatHoursIt(total)} ore in settimana
          {profile.weekly_hours ? ` · ${formatHoursIt(profile.weekly_hours)} di contratto` : ""}
        </span>
      </PageHeader>
      {tabs}
      <ViewSwitch view="settimana" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Settimana precedente">
            <Link href={`/orari?settimana=${prev}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <span className="text-sm nums">
            {format(parseISO(days[0]), "d MMM", { locale: it })} –{" "}
            {format(parseISO(days[6]), "d MMM", { locale: it })}
          </span>
          <Button asChild variant="ghost" size="icon" aria-label="Settimana successiva">
            <Link href={`/orari?settimana=${next}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        {weekStart !== normalizeWeekParam(undefined, now) ? (
          <Link href="/orari" className="link-underline eyebrow">
            Questa settimana
          </Link>
        ) : null}
      </div>

      {!published ? (
        <p className="py-12 font-display text-2xl font-light text-subtle">
          Gli orari di questa settimana non sono ancora stati pubblicati.
        </p>
      ) : (
        <>
          {week?.note ? (
            <p className="mb-6 border-l-2 border-foreground pl-3 text-sm">{week.note}</p>
          ) : null}
          <ol className="border-t border-line">
            {days.map((d) => {
              const list = mine.filter((s) => s.date === d);
              const text = publishedDayText(list, true);
              const absence = list.find((s) => s.is_absence);
              const leave = leaveByDate.get(d);
              const colleagues = all
                .filter(
                  (s) =>
                    s.date === d && s.profile_id !== profile.id && !s.is_absence && s.start_time,
                )
                .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
              const uniqueColleagues = [
                ...new Map(colleagues.map((c) => [c.profile_id, c])).values(),
              ];
              const first = list[0];
              return (
                <li
                  key={d}
                  aria-current={d === today ? "date" : undefined}
                  className={cn(
                    "grid gap-2 border-b border-line py-5 sm:grid-cols-[9rem_1fr_auto] sm:gap-6",
                    d === today && "border-t-[3px] border-t-foreground",
                  )}
                >
                  <div className="pt-1 eyebrow text-foreground capitalize">
                    {format(parseISO(d), "EEEE d", { locale: it })}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {text && !absence ? (
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-2xl font-light nums">{text}</span>
                        {list.some((s) => s.changed) ? (
                          <Badge tone="warning">Modificato</Badge>
                        ) : null}
                      </p>
                    ) : leave ? (
                      <p className="font-display text-2xl font-light text-muted">
                        {leaveLabelAdmin(leave)}
                      </p>
                    ) : absence ? (
                      <p className="font-display text-2xl font-light text-muted">{text}</p>
                    ) : (
                      <p className="font-display text-2xl font-light text-subtle">Libero</p>
                    )}
                    {first && !absence ? (
                      <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                        {first.break_minutes ? <span>Pausa {first.break_minutes}′</span> : null}
                        {first.zone ? (
                          <span>{first.zone === "vista" ? "Vista" : "Sole"}</span>
                        ) : null}
                        {list.some((s) => s.is_back_office) ? <span>Back office</span> : null}
                        <span className="nums">{formatHoursIt(dayHours(list))} h</span>
                      </p>
                    ) : null}
                    {first?.note ? <p className="text-sm">{first.note}</p> : null}
                    {uniqueColleagues.length > 0 && text && !absence ? (
                      <p className="text-xs text-muted">
                        Con te:{" "}
                        {uniqueColleagues
                          .map((c) => names.get(c.profile_id))
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    ) : null}
                  </div>
                  {first && !absence && d >= today ? (
                    <div className="sm:pt-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/richieste/nuova?tipo=cambio_turno&turno=${first.id}&dal=${d}&al=${d}`}
                        >
                          <Repeat aria-hidden /> Chiedi un cambio
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <CalendarFeed token={profile.ical_token} />
    </>
  );
}

function ViewSwitch({ view }: { view: "settimana" | "mese" }) {
  return (
    <div
      role="tablist"
      aria-label="Vista"
      className="mb-6 inline-grid grid-cols-2 border border-foreground"
    >
      {(
        [
          ["settimana", "Settimana", "/orari"],
          ["mese", "Mese", "/orari?vista=mese"],
        ] as const
      ).map(([value, label, href]) => (
        <Link
          key={value}
          role="tab"
          aria-selected={view === value}
          href={href}
          className={cn(
            "flex min-h-10 items-center justify-center px-5 text-sm",
            view === value ? "bg-foreground text-background" : "hover:bg-surface",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
