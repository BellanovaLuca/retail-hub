import type { Metadata } from "next";
import Link from "next/link";
import { ResponsibilityBoard } from "@/components/responsibilities/board";
import { boardProps } from "@/components/responsibilities/board-rows";
import { ExtraTaskList } from "@/components/responsibilities/extra-task-list";
import { PersonFilter } from "@/components/responsibilities/person-filter";
import { ResponsibilityCards } from "@/components/responsibilities/responsibility-cards";
import { TodayDutiesList } from "@/components/responsibilities/today-duties";
import { WeekNav } from "@/components/responsibilities/week-nav";
import { signAttachments } from "@/lib/announcements/storage";
import { requireProfile } from "@/lib/auth/session";
import { getBoard, getExtraTasks, getTodayDuties } from "@/lib/data/responsibilities";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Spunte delle responsabilità" };

/** Spunte: oggi tocca a te, tabellone della settimana da spuntare e attività extra. */
export default async function SpuntePage({
  searchParams,
}: {
  searchParams: Promise<{ settimana?: string; persona?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const now = nowInRome();
  const today = toISODate(now);
  const currentWeek = toISODate(weekStart(now));
  let week = normalizeWeekParam(sp.settimana, now);
  if (week > currentWeek) week = currentWeek;

  const supabase = await createClient();
  const [board, tasks, duties] = await Promise.all([
    getBoard(supabase, week, today),
    getExtraTasks(supabase),
    getTodayDuties(supabase, profile.id, today),
  ]);

  const persona = sp.persona && board.people.some((p) => p.id === sp.persona) ? sp.persona : null;
  const focusId = persona ?? profile.id;
  const focusName =
    focusId === profile.id
      ? null
      : (board.people.find((p) => p.id === focusId)?.displayName ?? "—");

  const focusItems = board.items.filter(
    (r) => r.ownerId === focusId || r.supportIds.includes(focusId) || r.allStaff,
  );
  const signed = await signAttachments(focusItems.flatMap((r) => r.attachments));
  const attachments = new Map(signed.map((a) => [a.path, a]));

  const { rows, checks, days } = boardProps(board, persona);
  const visibleTasks = persona
    ? tasks.filter((t) => t.assignees.some((a) => a.id === persona))
    : tasks;
  const viewer = { id: profile.id, name: profile.display_name, isAdmin: profile.role === "admin" };

  return (
    <div className="flex flex-col gap-16">
      <section aria-labelledby="oggi">
        <h2 id="oggi" className="mb-5 eyebrow">
          Oggi tocca a te
        </h2>
        <div className="max-w-2xl">
          <TodayDutiesList duties={duties} viewerName={profile.display_name} />
        </div>
      </section>

      <section aria-labelledby="mie">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="mie" className="eyebrow">
            {focusName ? `Di cosa si occupa ${focusName}` : "Le mie responsabilità"}
          </h2>
          {focusName ? (
            <Link
              href="/comunicazioni/responsabilita/spunte"
              className="link-underline text-sm text-muted"
            >
              Torna alle mie
            </Link>
          ) : null}
        </div>
        <ResponsibilityCards personId={focusId} items={board.items} attachments={attachments} />
      </section>

      <section aria-labelledby="tabellone">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="tabellone" className="eyebrow">
              Tabellone del negozio
            </h2>
            <WeekNav
              weekStart={week}
              currentWeekStart={currentWeek}
              basePath="/comunicazioni/responsabilita/spunte"
              query={{ persona: persona ?? undefined }}
            />
          </div>
          <PersonFilter
            people={board.people
              .filter((p) => p.active)
              .map((p) => ({ id: p.id, name: p.displayName }))}
            viewerId={profile.id}
            selected={persona}
          />
          <p className="text-xs text-muted">
            Spunta la casella quando hai svolto l&apos;attività (oggi o ieri). Chi si occupa di cosa
            lo trovi nella scheda Responsabilità.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 font-display text-xl font-light text-subtle">
            Nessuna attività per questa persona.
          </p>
        ) : (
          <ResponsibilityBoard
            rows={rows}
            days={days}
            today={today}
            checks={checks}
            viewer={viewer}
            personHref="/comunicazioni/responsabilita/spunte?persona="
            highlightPersonId={persona ? null : profile.id}
          />
        )}
      </section>

      <section aria-labelledby="extra">
        <h2 id="extra" className="mb-5 eyebrow">
          Attività extra
        </h2>
        <ExtraTaskList tasks={visibleTasks} viewer={viewer} today={today} />
      </section>
    </div>
  );
}
