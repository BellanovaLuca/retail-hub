import { FileDown, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResponsibilityBoard } from "@/components/responsibilities/board";
import { boardProps } from "@/components/responsibilities/board-rows";
import { ExtraTaskForm } from "@/components/responsibilities/extra-task-form";
import { ExtraTaskList } from "@/components/responsibilities/extra-task-list";
import { ResponsibilityOrder } from "@/components/responsibilities/responsibility-order";
import { WeekNav } from "@/components/responsibilities/week-nav";
import { Button } from "@/components/ui/button";
import { PersonDot, Table, Td, Th } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import {
  getBoard,
  getExtraTasks,
  getResponsibilities,
  loadsByPerson,
} from "@/lib/data/responsibilities";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";
import { cellState, isScheduledOn } from "@/lib/responsibilities/assignment";
import { createClient } from "@/lib/supabase/server";
import { getPickerData } from "../editor-data";

export const metadata: Metadata = { title: "Responsabilità" };

export default async function AdminResponsabilitaPage({
  searchParams,
}: {
  searchParams: Promise<{ settimana?: string }>;
}) {
  const profile = await requireAdmin();
  const sp = await searchParams;
  const now = nowInRome();
  const today = toISODate(now);
  const currentWeek = toISODate(weekStart(now));
  let week = normalizeWeekParam(sp.settimana, now);
  if (week > currentWeek) week = currentWeek;

  const supabase = await createClient();
  const [board, all, tasks, picker] = await Promise.all([
    getBoard(supabase, week, today),
    getResponsibilities(supabase, { includeInactive: true }),
    getExtraTasks(supabase, { includeCancelled: true, recentDays: 60 }),
    getPickerData(supabase),
  ]);
  const { rows, checks, days } = boardProps(board);
  const missing = board.items.reduce(
    (sum, r) =>
      sum +
      days.filter(
        (d) =>
          cellState({
            scheduled: isScheduledOn(r.scheduleDays, d),
            checked: !!board.checks[r.id]?.[d],
            date: d,
            today,
          }) === "missed",
      ).length,
    0,
  );
  const uncoveredToday = rows.filter((r) => r.todayUncovered).length;
  const loads = loadsByPerson(board.people, board.items, tasks);

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href="/admin/comunicazioni/responsabilita/nuova">
            <Plus aria-hidden /> Nuova attività
          </Link>
        </Button>
        <ExtraTaskForm people={picker.people} today={today} />
        <Button asChild variant="ghost">
          <a href={`/api/export/responsabilita?settimana=${week}`} target="_blank" rel="noopener">
            <FileDown aria-hidden /> Esporta PDF del tabellone
          </a>
        </Button>
      </div>

      <section aria-labelledby="tabellone">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="tabellone" className="eyebrow">
              Tabellone e storico delle spunte
            </h2>
            <p className="mt-1 text-sm text-muted nums">
              {missing > 0
                ? `${missing} ${missing === 1 ? "casella mancante" : "caselle mancanti"} in settimana`
                : "Nessuna casella mancante in settimana"}
              {uncoveredToday > 0 ? (
                <span className="text-danger">
                  {" "}
                  · oggi {uncoveredToday} {uncoveredToday === 1 ? "attività" : "attività"} senza
                  nessuno in turno
                </span>
              ) : null}
              {board.todayDuty && !board.todayScheduleKnown
                ? " · turni di oggi non pubblicati"
                : ""}
            </p>
          </div>
          <WeekNav
            weekStart={week}
            currentWeekStart={currentWeek}
            basePath="/admin/comunicazioni/responsabilita"
          />
        </div>
        <ResponsibilityBoard
          rows={rows}
          days={days}
          today={today}
          checks={checks}
          viewer={{ id: profile.id, name: profile.display_name, isAdmin: true }}
        />
      </section>

      <section aria-labelledby="attivita">
        <h2 id="attivita" className="mb-2 eyebrow">
          Attività
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          L&apos;ordine è quello del tabellone: trascina o usa le frecce. Apri un&apos;attività per
          cambiare responsabile, supporti, giorni e procedura.
        </p>
        <ResponsibilityOrder
          rows={all.map((r) => ({
            id: r.id,
            title: r.title,
            active: r.active,
            allStaff: r.allStaff,
            scheduleDays: r.scheduleDays,
            ownerName: r.owner?.name ?? null,
            supportNames: r.supports.map((s) => s.name),
          }))}
        />
      </section>

      <section aria-labelledby="extra">
        <h2 id="extra" className="mb-5 eyebrow">
          Attività extra
        </h2>
        <ExtraTaskList
          tasks={tasks}
          viewer={{ id: profile.id, name: profile.display_name, isAdmin: true }}
          today={today}
          canManage
        />
      </section>

      <section aria-labelledby="persone">
        <h2 id="persone" className="mb-2 eyebrow">
          Vista per persona
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Di cosa si occupa ciascuno, per bilanciare i carichi. «Giorni» = giorni-attività a
          settimana come responsabile.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Persona</Th>
              <Th>Responsabile di</Th>
              <Th>Supporto per</Th>
              <Th>Attività extra aperte</Th>
              <Th className="text-right">Giorni</Th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.person.id}>
                <Td className="whitespace-nowrap">
                  <Link
                    href={`/comunicazioni/responsabilita?persona=${l.person.id}`}
                    className="flex items-center gap-2 link-underline"
                  >
                    <PersonDot color={l.person.color} /> {l.person.name}
                  </Link>
                </Td>
                <Td className="font-medium">
                  {l.owner.map((o) => o.title).join(", ") || <span className="text-subtle">—</span>}
                </Td>
                <Td className="text-muted">
                  {l.support.map((o) => o.title).join(", ") || (
                    <span className="text-subtle">—</span>
                  )}
                </Td>
                <Td className="text-muted">
                  {l.extra.map((o) => o.title).join(", ") || <span className="text-subtle">—</span>}
                </Td>
                <Td className="text-right nums">{l.ownerDays}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
