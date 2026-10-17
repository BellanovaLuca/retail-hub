"use client";

import { addDays, format, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Grid3x3,
  Rows3,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  SpreadsheetGrid,
  type CellChange,
  type CellState,
  type FooterRow,
  type GridColumn,
  type GridRow,
  type SaveState,
} from "@/components/spreadsheet";
import { Timesheet, type TimesheetSaveInput } from "@/components/schedule/timesheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { weekNumber } from "@/lib/dates";
import type { StoreCalendar } from "@/lib/data/schedule";
import { buildSnapshot, cellText, resolveBackOffice, resolveZone } from "@/lib/schedule/cells";
import type {
  LeaveRecord,
  PublishedShift,
  SchedulePerson,
  ShiftRecord,
  TemplateRecord,
} from "@/lib/schedule/types";
import {
  dayHeader,
  formatHoursIt,
  groupPeopleByDepartment,
  groupShiftsByDay,
  isFullDayLeave,
  isWeekend,
  key,
  leaveLabelAdmin,
  weekHoursByPerson,
} from "@/lib/schedule/view";
import { parseShiftCell } from "@/lib/shifts/parse";
import { cn } from "@/lib/utils";
import { saveShiftCells, saveShiftDay } from "../actions";
import { DayDialog } from "./day-dialog";
import { PublishDialog } from "./publish-dialog";
import { WeekMenu } from "./week-menu";
import { useWeekRealtime } from "./use-week-realtime";

export type EditorProps = {
  me: { id: string; displayName: string };
  week: {
    id: string;
    weekStart: string;
    status: "draft" | "published";
    version: number;
    publishedAt: string | null;
    note: string | null;
    ruleSetId: string | null;
    publishedShifts: PublishedShift[];
  };
  days: string[];
  today: string;
  shifts: ShiftRecord[];
  leaves: LeaveRecord[];
  people: SchedulePerson[];
  templates: TemplateRecord[];
  departments: { id: string; name: string }[];
  calendar: StoreCalendar;
  weekTemplates: { id: string; name: string }[];
  ruleSets: { id: string; name: string; is_default: boolean }[];
  /** Pannello avvisi delle regole (milestone Coperture). */
  sidePanelExtra?: React.ReactNode;
  footerExtra?: FooterRow[];
  cellWarning?: (profileId: string, date: string) => string | undefined;
  warningsCount?: number;
  warningsList?: React.ReactNode;
  /** Richieste di assenza in attesa (verde tratteggiato nel foglio orario). */
  pendingRequests?: { profileId: string; date: string }[];
  /** Avviso delle regole per una fascia del foglio orario. */
  slotWarning?: (date: string, start: string) => string | undefined;
};

export function ShiftEditor(props: EditorProps) {
  const { week, days, today, shifts, leaves, people, templates, departments, calendar } = props;
  const router = useRouter();
  const [mode, setMode] = useState<"grid" | "timesheet">("grid");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Map<string, string>>(new Map());
  const [dialog, setDialog] = useState<{ profileId: string; date: string } | null>(null);
  const [, startTransition] = useTransition();
  const presence = useWeekRealtime(week.id, props.me);

  // Le modifiche ottimistiche valgono finché il server non restituisce i dati aggiornati.
  const lastShifts = useRef(shifts);
  useEffect(() => {
    if (lastShifts.current !== shifts) {
      lastShifts.current = shifts;
      setPending(new Map());
    }
  }, [shifts]);

  const tplById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const byDay = useMemo(() => groupShiftsByDay(shifts), [shifts]);
  const leaveByDay = useMemo(
    () => new Map(leaves.map((l) => [key(l.profileId, l.date), l])),
    [leaves],
  );
  const holidays = useMemo(
    () => new Map(calendar.holidays.map((h) => [h.date, h])),
    [calendar.holidays],
  );
  const hours = useMemo(() => weekHoursByPerson(shifts), [shifts]);

  const publishedByDay = useMemo(() => {
    const grouped = new Map<string, PublishedShift[]>();
    for (const s of week.publishedShifts) {
      const k = key(s.profile_id, s.date);
      grouped.set(k, [...(grouped.get(k) ?? []), s]);
    }
    return grouped;
  }, [week.publishedShifts]);

  const { changes: unpublished } = useMemo(
    () => buildSnapshot(shifts, tplById, peopleById, week.publishedShifts),
    [shifts, tplById, peopleById, week.publishedShifts],
  );
  const changedKeys = useMemo(
    () => new Set(unpublished.map((c) => key(c.profileId, c.date))),
    [unpublished],
  );

  const groups = useMemo(() => groupPeopleByDepartment(people, departments), [people, departments]);
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const rows: GridRow[] = useMemo(
    () =>
      groups.flatMap((g) =>
        g.people.map((p) => {
          const others = p.departmentIds
            .filter((d) => d !== p.primaryDepartmentId)
            .map((d) => deptName.get(d));
          return {
            id: p.id,
            label: p.displayName,
            sublabel: others.length ? `+ ${others.join(", ")}` : undefined,
            groupId: g.id,
            accentColor: p.color ?? undefined,
          };
        }),
      ),
    [groups, deptName],
  );

  const columns: GridColumn[] = useMemo(
    () =>
      days.map((d) => {
        const h = dayHeader(d);
        const holiday = holidays.get(d);
        return {
          id: d,
          label: h.label,
          sublabel: holiday
            ? `${h.sublabel} · ${holiday.storeClosed ? "chiuso" : "festivo"}`
            : h.sublabel,
          highlight: d === today,
          shaded: isWeekend(d) || Boolean(holiday),
          width: 128,
        };
      }),
    [days, today, holidays],
  );

  const getValue = useCallback(
    (profileId: string, date: string) => {
      const k = key(profileId, date);
      if (pending.has(k)) return pending.get(k)!;
      const leave = leaveByDay.get(k);
      const text = cellText(byDay.get(k) ?? [], tplById);
      if (leave && isFullDayLeave(leave) && !text) return leaveLabelAdmin(leave);
      return text;
    },
    [pending, leaveByDay, byDay, tplById],
  );

  const getCellState = useCallback(
    (profileId: string, date: string): CellState | undefined => {
      const k = key(profileId, date);
      const leave = leaveByDay.get(k);
      const dayShifts = byDay.get(k) ?? [];
      const warning = props.cellWarning?.(profileId, date);
      if (dayShifts.some((s) => s.conflict)) {
        return {
          tone: "danger",
          title: "In conflitto con un'assenza approvata: apri il dettaglio per risolvere.",
        };
      }
      if (leave && isFullDayLeave(leave) && dayShifts.length === 0) {
        return {
          readOnly: true,
          tone: leave.status === "tentative" ? "dashed" : "hatched",
          title: `${leaveLabelAdmin(leave)}${leave.source === "request" ? " · richiesta approvata" : ""}`,
        };
      }
      if (warning) return { tone: "warning", title: warning };
      if (holidays.get(date)?.storeClosed) return { tone: "muted", title: "Negozio chiuso" };
      return undefined;
    },
    [leaveByDay, byDay, holidays, props],
  );

  const renderCell = useCallback(
    (profileId: string, date: string, value: string) => {
      const k = key(profileId, date);
      const person = peopleById.get(profileId);
      const dayShifts = byDay.get(k) ?? [];
      const first = dayShifts[0];
      const zone = first ? resolveZone(first, person) : null;
      const backOffice = dayShifts.some((s) => resolveBackOffice(s, person) && s.start);
      const needsZone = person?.homeZone === "jolly" && dayShifts.some((s) => s.start) && !zone;
      const leave = leaveByDay.get(k);
      return (
        <span className="flex w-full items-center gap-1.5 truncate">
          {zone && person?.homeZone === "jolly" ? (
            <span
              aria-label={zone === "vista" ? "Vista" : "Sole"}
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                zone === "vista" ? "bg-vista" : "bg-sole",
              )}
            />
          ) : null}
          <span className="truncate">{value}</span>
          {backOffice ? <span className="text-[0.625rem] text-muted">BO</span> : null}
          {needsZone ? (
            <span className="text-[0.625rem] text-warning" title="Scegli l'area">
              ?
            </span>
          ) : null}
          {leave && !isFullDayLeave(leave) ? (
            <span className="text-[0.625rem] text-muted">{leaveLabelAdmin(leave)}</span>
          ) : null}
          {changedKeys.has(k) && week.status === "published" ? (
            <span
              aria-label="Modificato dopo la pubblicazione"
              className="ml-auto size-1.5 shrink-0 rounded-full bg-warning"
            />
          ) : null}
        </span>
      );
    },
    [peopleById, byDay, leaveByDay, changedKeys, week.status],
  );

  const normalize = useCallback(
    (value: string) => {
      const parsed = parseShiftCell(
        value,
        templates.map((t) => ({ ...t })),
      );
      if (parsed.kind === "error") return { error: parsed.message };
      if (parsed.kind === "template") return { value: parsed.code };
      return { value };
    },
    [templates],
  );

  const onChange = useCallback(
    (changes: CellChange[]) => {
      setPending((prev) => {
        const next = new Map(prev);
        for (const c of changes) next.set(key(c.rowId, c.colId), c.value);
        return next;
      });
      setSaveState("saving");
      startTransition(async () => {
        const res = await saveShiftCells(
          week.id,
          changes.map((c) => ({ profileId: c.rowId, date: c.colId, value: c.value })),
        );
        setSaveState(res.ok ? "saved" : "error");
        setMessage(res.ok ? null : res.message);
        router.refresh();
      });
    },
    [week.id, router],
  );

  // Foglio orario: ogni giornata dipinta sostituisce i turni del giorno, poi si ricaricano i dati.
  const onSaveDay = useCallback(
    async (input: TimesheetSaveInput) => {
      const res = await saveShiftDay(input);
      router.refresh();
      return res;
    },
    [router],
  );

  const footerRows: FooterRow[] = useMemo(() => {
    const presentBy = (date: string, deptId?: string) =>
      people.filter((p) => {
        const list = byDay.get(key(p.id, date)) ?? [];
        if (!list.some((s) => s.start)) return false;
        if (!deptId) return true;
        return list.some((s) => (s.departmentId ?? p.primaryDepartmentId) === deptId);
      }).length;
    const totalHours = (date: string) =>
      formatHoursIt(
        [...weekHoursByPerson(shifts.filter((s) => s.date === date)).values()].reduce(
          (a, b) => a + b,
          0,
        ),
      );
    return [
      {
        id: "presenti",
        label: "Presenti",
        cells: Object.fromEntries(days.map((d) => [d, presentBy(d)])),
      },
      ...departments.map((dep) => ({
        id: `dep-${dep.id}`,
        label: dep.name,
        cells: Object.fromEntries(days.map((d) => [d, presentBy(d, dep.id)])),
      })),
      {
        id: "ore",
        label: "Ore totali",
        cells: Object.fromEntries(days.map((d) => [d, totalHours(d)])),
      },
      ...(props.footerExtra ?? []),
    ];
  }, [people, byDay, days, departments, shifts, props.footerExtra]);

  const prevWeek = format(addDays(parseISO(week.weekStart), -7), "yyyy-MM-dd");
  const nextWeek = format(addDays(parseISO(week.weekStart), 7), "yyyy-MM-dd");
  const contractTotal = people.reduce((sum, p) => sum + (p.weeklyHours ?? 0), 0);
  const plannedTotal = [...hours.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 eyebrow">Turni</p>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" aria-label="Settimana precedente">
              <Link href={`/admin/turni/${prevWeek}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <h1 className="font-display text-4xl font-light tracking-tight nums">
              Week {weekNumber(parseISO(week.weekStart))}
            </h1>
            <Button asChild variant="ghost" size="icon" aria-label="Settimana successiva">
              <Link href={`/admin/turni/${nextWeek}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>
              {dayHeader(days[0]).sublabel} – {dayHeader(days[6]).sublabel}
            </span>
            {week.status === "draft" ? (
              <Badge>Bozza</Badge>
            ) : (
              <Badge tone="solid">Pubblicata · v{week.version}</Badge>
            )}
            {week.status === "published" && unpublished.length > 0 ? (
              <Badge tone="warning">{unpublished.length} modifiche da pubblicare</Badge>
            ) : null}
            <span className="nums">
              {formatHoursIt(plannedTotal)} / {formatHoursIt(contractTotal)} h di contratto
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Vista" className="flex border border-foreground">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "grid"}
              onClick={() => setMode("grid")}
              className={cn(
                "flex min-h-10 items-center gap-2 px-3 text-sm",
                mode === "grid" && "bg-foreground text-background",
              )}
            >
              <Grid3x3 className="size-4 stroke-[1.5]" aria-hidden /> Persone × giorni
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "timesheet"}
              onClick={() => setMode("timesheet")}
              className={cn(
                "flex min-h-10 items-center gap-2 border-l border-foreground px-3 text-sm",
                mode === "timesheet" && "bg-foreground text-background",
              )}
            >
              <Rows3 className="size-4 stroke-[1.5]" aria-hidden /> Foglio orario
            </button>
          </div>
          <WeekMenu
            weekId={week.id}
            weekTemplates={props.weekTemplates}
            ruleSets={props.ruleSets}
            ruleSetId={week.ruleSetId}
            note={week.note}
          />
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/export/turni/${week.weekStart}?formato=xlsx`}>
              <FileSpreadsheet aria-hidden /> Excel
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a
              href={`/api/export/turni/${week.weekStart}?formato=pdf${mode === "timesheet" ? "&layout=week" : ""}`}
            >
              <FileDown aria-hidden /> PDF
            </a>
          </Button>
          <PublishDialog
            weekId={week.id}
            firstPublish={week.status === "draft"}
            changes={unpublished}
            people={peopleById}
            warnings={props.warningsCount}
            warningsList={props.warningsList}
            trigger={
              <Button size="sm">
                <Send aria-hidden /> {week.status === "draft" ? "Pubblica" : "Ripubblica"}
              </Button>
            }
          />
        </div>
      </header>

      {message ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-sm text-danger">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_17rem]">
        <div className="min-w-0">
          {mode === "grid" ? (
            <SpreadsheetGrid
              ariaLabel={`Turni della week ${weekNumber(parseISO(week.weekStart))}`}
              rows={rows}
              columns={columns}
              groups={groups.map((g) => ({ id: g.id, label: g.label, collapsible: true }))}
              getValue={getValue}
              getCellState={getCellState}
              renderCell={renderCell}
              normalize={normalize}
              onChange={onChange}
              onCellActivate={(profileId, date) => setDialog({ profileId, date })}
              footerRows={footerRows}
              rowHeaderLabel="Persona"
              saveState={saveState}
              presence={presence}
              showDensityToggle
            />
          ) : (
            <Timesheet
              weekId={week.id}
              weekNumber={weekNumber(parseISO(week.weekStart))}
              days={days}
              today={today}
              shifts={shifts}
              leaves={leaves}
              people={people}
              departments={departments}
              calendar={calendar}
              onSaveDay={onSaveDay}
              pendingRequests={props.pendingRequests}
              violationsByDaySlot={props.slotWarning}
            />
          )}
          <p className={cn("mt-3 text-xs text-muted", mode === "timesheet" && "hidden")}>
            Digita un codice (
            {templates
              .slice(0, 4)
              .map((t) => t.code)
              .join(", ")}
            …) o un orario come <span className="nums">10-14 16-20</span>. Doppio clic o Alt+Invio
            per il dettaglio (pausa, reparto, area, back office, nota).
          </p>
        </div>

        <aside className="flex flex-col gap-6">
          {props.sidePanelExtra}
          <section>
            <h2 className="mb-3 eyebrow">Ore per persona</h2>
            <ul className="divide-y divide-line border-y border-line text-sm">
              {people.map((p) => {
                const planned = hours.get(p.id) ?? 0;
                const contract = p.weeklyHours ?? 0;
                const diff = planned - contract;
                const off = contract > 0 && Math.abs(diff) / contract > 0.1;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="truncate">{p.displayName}</span>
                    <span className={cn("shrink-0 nums", off ? "text-danger" : "text-muted")}>
                      {formatHoursIt(planned)}
                      <span className="text-subtle">
                        {" "}
                        / {contract ? formatHoursIt(contract) : "—"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>

      {dialog ? (
        <DayDialog
          open
          onClose={() => setDialog(null)}
          weekId={week.id}
          person={peopleById.get(dialog.profileId)!}
          date={dialog.date}
          shifts={byDay.get(key(dialog.profileId, dialog.date)) ?? []}
          leave={leaveByDay.get(key(dialog.profileId, dialog.date))}
          templates={templates}
          departments={departments}
          published={publishedByDay.get(key(dialog.profileId, dialog.date)) ?? []}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
