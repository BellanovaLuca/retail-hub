import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LeavePlanner } from "@/components/leaves/leave-planner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth/session";
import { getYearLeaves, getYearPublicLeaves } from "@/lib/data/leaves";
import { getDepartments } from "@/lib/data/people";
import { getPublicPeople, getStoreCalendar } from "@/lib/data/schedule";
import { nowInRome, toISODate } from "@/lib/dates";
import { leaveLabel } from "@/lib/leaves/parse";
import { formatRangeIt, groupLeavePeriods, leaveTotals, parseYearParam } from "@/lib/leaves/plan";
import { parsePlannerParams } from "@/lib/leaves/view-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ferie" };

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireProfile();
  const sp = await searchParams;
  const now = nowInRome();
  const today = toISODate(now);
  const anno = Array.isArray(sp.anno) ? sp.anno[0] : sp.anno;
  const year = parseYearParam(anno, now.getFullYear());

  const supabase = await createClient();
  const [people, departments, publicLeaves, myLeaves, calendar] = await Promise.all([
    getPublicPeople(supabase),
    getDepartments(supabase),
    getYearPublicLeaves(supabase, year),
    // La tabella completa: RLS lascia al dipendente solo le proprie righe.
    getYearLeaves(supabase, year, me.id),
    getStoreCalendar(supabase, `${year}-01-01`, `${year}-12-31`),
  ]);
  const initial = parsePlannerParams(sp, { year, today });
  const periods = groupLeavePeriods(myLeaves);
  const totals = leaveTotals(myLeaves, year);
  const defaultFrom = year === now.getFullYear() ? today : `${year}-01-01`;

  return (
    <div className="flex flex-col gap-12">
      <header>
        <p className="mb-2 eyebrow">Planning del negozio</p>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Anno precedente">
            <Link href={`/ferie?anno=${year - 1}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h1 className="font-display text-4xl font-light tracking-tight nums">Ferie {year}</h1>
          <Button asChild variant="ghost" size="icon" aria-label="Anno successivo">
            <Link href={`/ferie?anno=${year + 1}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Il planning è in sola lettura. Per chiedere le ferie seleziona un periodo sul foglio
          oppure indica le date qui sotto.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardTitle>Le mie ferie {year}</CardTitle>
          <p className="font-display text-4xl font-light nums">
            {totals.total}
            <span className="ml-2 text-base text-muted">
              {totals.total === 1 ? "giorno di ferie" : "giorni di ferie"}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted nums">
            {totals.confirmed} confermati · {totals.tentative} da confermare
          </p>
          {periods.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Nessuna ferie o assenza nel {year}.</p>
          ) : (
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {periods.map((p) => (
                <li
                  key={`${p.from}-${p.type}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm",
                    p.to < today && "text-muted",
                  )}
                >
                  <span className="min-w-36 nums">{formatRangeIt(p.from, p.to)}</span>
                  <span className="text-muted nums">
                    {p.hours
                      ? `${String(p.hours).replace(".", ",")} h`
                      : `${p.days} ${p.days === 1 ? "giorno" : "giorni"}`}
                  </span>
                  <span>{leaveLabel(p.type)}</span>
                  <span className="ml-auto">
                    {p.status === "tentative" ? (
                      <Badge tone="warning">Da confermare</Badge>
                    ) : (
                      <Badge>Confermate</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Richiedi ferie</CardTitle>
          <form action="/richieste/nuova" method="get" className="flex flex-col gap-4">
            <input type="hidden" name="tipo" value="ferie" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="ferie-dal">Dal</Label>
              <Input id="ferie-dal" name="dal" type="date" required defaultValue={defaultFrom} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ferie-al">Al</Label>
              <Input id="ferie-al" name="al" type="date" required defaultValue={defaultFrom} />
            </div>
            <Button type="submit">Richiedi ferie</Button>
          </form>
        </Card>
      </div>

      <section>
        <h2 className="mb-6 eyebrow">Planning del negozio</h2>
        <LeavePlanner
          mode="employee"
          year={year}
          today={today}
          people={people.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            color: p.color,
            primaryDepartmentId: p.primaryDepartmentId,
            departmentIds: p.departmentIds,
          }))}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          leaves={publicLeaves.map((l) => ({
            profileId: l.profileId,
            date: l.date,
            type: l.kind === "ferie" ? "ferie" : "assente",
            hours: null,
            status: l.status,
            source: null,
          }))}
          holidays={calendar.holidays}
          thresholds={{}}
          meId={me.id}
          initial={initial}
        />
      </section>
    </div>
  );
}
