import type { Metadata } from "next";
import Link from "next/link";
import { PersonFilter } from "@/components/responsibilities/person-filter";
import { ResponsibilityOverview } from "@/components/responsibilities/overview";
import { WeekGrid } from "@/components/responsibilities/week-grid";
import { WeekNav } from "@/components/responsibilities/week-nav";
import { signAttachments } from "@/lib/announcements/storage";
import { requireProfile } from "@/lib/auth/session";
import { getPeopleDirectory } from "@/lib/data/announcements";
import { getResponsibilities } from "@/lib/data/responsibilities";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";
import { assigneeIds, shiftDate } from "@/lib/responsibilities/assignment";
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
  const persona = sp.persona && active.some((p) => p.id === sp.persona) ? sp.persona : null;
  const signed = await signAttachments(items.flatMap((r) => r.attachments));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted">
            La griglia completa del negozio: chi si occupa di cosa nella settimana. La tua riga è
            evidenziata; scegli un collega per evidenziare la sua.
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
        <WeekGrid
          caption="Responsabilità di ciascuno nella settimana"
          columns={items.map((r) => ({
            id: r.id,
            title: r.title,
            scheduleDays: r.scheduleDays,
            allStaff: r.allStaff,
            profileIds: r.allStaff ? [] : assigneeIds(r),
          }))}
          people={active.map((p) => ({ id: p.id, name: p.displayName, color: p.color }))}
          highlightId={persona ?? profile.id}
          viewerId={profile.id}
        />
        <p className="mt-3 text-xs text-muted">
          Sotto ogni attività i giorni in cui è prevista (L M M G V S D). Nei giorni previsti la fa
          chi tra gli assegnati è in turno.
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
