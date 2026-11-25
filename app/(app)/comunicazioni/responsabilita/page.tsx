import type { Metadata } from "next";
import Link from "next/link";
import { PersonFilter } from "@/components/responsibilities/person-filter";
import { ResponsibilityOverview } from "@/components/responsibilities/overview";
import { WeekDayGrid } from "@/components/responsibilities/week-day-grid";
import { WeekNav } from "@/components/responsibilities/week-nav";
import { signAttachments } from "@/lib/announcements/storage";
import { requireProfile } from "@/lib/auth/session";
import { getPeopleDirectory } from "@/lib/data/announcements";
import { getResponsibilities } from "@/lib/data/responsibilities";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";
import { personDaysOf, shiftDate } from "@/lib/responsibilities/assignment";
import { scheduleLabel } from "@/lib/responsibilities/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Responsabilità" };

/** Panoramica unica: chi si occupa di cosa in negozio, per tutti, con il proprio nome evidenziato. */
export default async function ResponsabilitaPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; settimana?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = await createClient();
  const people = await getPeopleDirectory(supabase, { includeInactive: true });
  // Assegnazioni della settimana scelta (di default quella in corso; si vede anche la prossima).
  const now = nowInRome();
  const currentWeek = toISODate(weekStart(now));
  const maxWeek = shiftDate(currentWeek, 7);
  let week = normalizeWeekParam(sp.settimana, now);
  if (week > maxWeek) week = maxWeek;
  const items = await getResponsibilities(supabase, {
    people: new Map(people.map((p) => [p.id, p])),
    week,
  });

  const active = people.filter((p) => p.active);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(week, i));
  const today = toISODate(now);
  const allStaff = items.filter((r) => r.allStaff);
  const persona = sp.persona && active.some((p) => p.id === sp.persona) ? sp.persona : null;
  const signed = await signAttachments(items.flatMap((r) => r.attachments));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted">
            La griglia completa del negozio: chi si occupa di cosa, giorno per giorno. La tua riga
            è evidenziata; scegli un collega per evidenziare la sua.
          </p>
          <Link
            href="/comunicazioni/responsabilita/spunte"
            className="link-underline text-sm font-medium"
          >
            Segna le attività fatte →
          </Link>
        </div>
        <PersonFilter
          people={active.map((p) => ({ id: p.id, name: p.displayName }))}
          viewerId={profile.id}
          selected={persona}
          allLabel="Il mio nome"
          hideMine
        />
      </div>
      <section aria-labelledby="griglia-negozio">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="griglia-negozio" className="eyebrow">
            Griglia del negozio
          </h2>
          <WeekNav
            weekStart={week}
            currentWeekStart={currentWeek}
            maxWeekStart={maxWeek}
            basePath="/comunicazioni/responsabilita"
            query={{ persona: persona ?? undefined }}
          />
        </div>
        <WeekDayGrid
          caption="Responsabilità di ciascuno, giorno per giorno"
          days={days}
          today={today}
          items={items
            .filter((r) => !r.allStaff)
            .map((r) => ({ id: r.id, title: r.title, personDays: personDaysOf(r) }))}
          people={active.map((p) => ({ id: p.id, name: p.displayName, color: p.color }))}
          highlightId={persona ?? profile.id}
          viewerId={profile.id}
        />
        {allStaff.length ? (
          <p className="mt-3 text-sm">
            <span className="mr-2 eyebrow">Per tutti</span>
            {allStaff.map((r) => `${r.title} (${scheduleLabel(r.scheduleDays)})`).join(" · ")}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted">
          In ogni casella le attività di quella persona in quel giorno. Le attività «per tutti» le
          fa chi è in turno.
        </p>
      </section>
      <ResponsibilityOverview
        items={items}
        people={people}
        viewerId={profile.id}
        highlightId={persona ?? profile.id}
        attachments={new Map(signed.map((a) => [a.path, a]))}
      />
    </div>
  );
}
