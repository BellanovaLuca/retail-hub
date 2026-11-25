import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SubNav } from "@/components/layout/sub-nav";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { requireProfile } from "@/lib/auth/session";
import { computeCoverage } from "@/lib/coverage";
import { getDepartments } from "@/lib/data/people";
import {
  getPublicLeaves,
  getPublicPeople,
  getPublishedShifts,
  getStoreCalendar,
  normalizeWeekParam,
  weekDates,
} from "@/lib/data/schedule";
import { nowInRome, toISODate, weekNumber } from "@/lib/dates";
import { publishedToInputs, peopleToInputs } from "@/lib/schedule/adapters";
import { isHolidayClosure, openingFor } from "@/lib/schedule/opening";
import { createClient } from "@/lib/supabase/server";
import { ShopGrid, type DaySummary } from "./shop-grid";

export const metadata: Metadata = { title: "Griglia del negozio" };

export default async function NegozioPage({
  searchParams,
}: {
  searchParams: Promise<{ settimana?: string; reparto?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const now = nowInRome();
  const weekStart = normalizeWeekParam(params.settimana, now);
  const days = weekDates(weekStart);
  const supabase = await createClient();
  const [shifts, people, leaves, departments, calendar, { data: week }] = await Promise.all([
    getPublishedShifts(supabase, days[0], days[6]),
    getPublicPeople(supabase),
    getPublicLeaves(supabase, days[0], days[6]),
    getDepartments(supabase),
    getStoreCalendar(supabase, days[0], days[6]),
    supabase
      .from("published_weeks")
      .select("status, note")
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);

  const deps = departments.map((d) => ({ id: d.id, name: d.name }));
  // Chi è assente per l'intera giornata non conta tra i presenti né nella copertura, anche se il
  // suo turno è ancora nell'orario pubblicato. Un'assenza di poche ore non toglie la presenza.
  const awayAllDay = new Set(leaves.filter((l) => !l.hours).map((l) => `${l.profileId}|${l.date}`));
  const inputs = publishedToInputs(shifts).filter(
    (s) => !awayAllDay.has(`${s.profileId}|${s.date}`),
  );
  const personInputs = peopleToInputs(people);

  // Riepilogo per giorno, solo nell'orario di apertura (§7.2).
  const summaries: Record<string, DaySummary> = {};
  for (const date of days) {
    // Stessa precedenza delle regole: eccezione del giorno > festivo chiuso > orario standard.
    const hours = openingFor(date, calendar);
    const present = new Set(inputs.filter((s) => s.date === date).map((s) => s.profileId)).size;
    if (!hours) {
      summaries[date] = {
        present,
        closed: true,
        minVista: 0,
        minSole: 0,
        minDelta: 0,
        copOtt: true,
      };
      continue;
    }
    const slots = computeCoverage({
      date,
      shifts: inputs,
      people: personInputs,
      departments: deps,
    }).filter((s) => s.start >= hours.start && s.end <= hours.end);
    summaries[date] = {
      present,
      closed: false,
      minVista: Math.min(...slots.map((s) => s.vista)),
      minSole: Math.min(...slots.map((s) => s.sole)),
      minDelta: Math.min(...slots.map((s) => s.delta)),
      copOtt: slots.every((s) => s.copOtt),
    };
  }

  const prev = toISODate(addDays(parseISO(weekStart), -7));
  const next = toISODate(addDays(parseISO(weekStart), 7));

  return (
    <>
      <PageHeader eyebrow={`Week ${weekNumber(parseISO(weekStart))}`} title="Griglia del negozio">
        {format(parseISO(days[0]), "d MMM", { locale: it })} –{" "}
        {format(parseISO(days[6]), "d MMM yyyy", { locale: it })}
      </PageHeader>
      <SubNav
        items={[
          { href: "/orari", label: "I miei orari" },
          { href: "/orari/negozio", label: "Griglia del negozio" },
        ]}
        exact={["/orari"]}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Settimana precedente">
            <Link href={`/orari/negozio?settimana=${prev}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Settimana successiva">
            <Link href={`/orari/negozio?settimana=${next}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        {week?.status === "published" ? (
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/export/turni-pubblicati/${weekStart}`}>
              <FileDown aria-hidden /> Stampa PDF
            </a>
          </Button>
        ) : null}
      </div>
      {week?.status !== "published" ? (
        <p className="py-12 font-display text-2xl font-light text-subtle">
          Gli orari di questa settimana non sono ancora stati pubblicati.
        </p>
      ) : (
        <>
          {week.note ? (
            <p className="mb-6 border-l-2 border-foreground pl-3 text-sm">{week.note}</p>
          ) : null}
          <ShopGrid
            me={profile.id}
            days={days}
            today={toISODate(now)}
            shifts={shifts}
            people={people}
            leaves={leaves}
            departments={deps}
            // "Chiuso" solo se nessuna eccezione riapre il negozio in quel festivo.
            holidays={calendar.holidays.map((h) => ({
              ...h,
              storeClosed: isHolidayClosure(h.date, calendar),
            }))}
            summaries={summaries}
            initialDepartment={params.reparto ?? ""}
          />
        </>
      )}
    </>
  );
}
