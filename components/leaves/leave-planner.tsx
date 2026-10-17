"use client";

import { CalendarRange, FileDown, FileSpreadsheet, Grid3x3 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { saveLeaveCells } from "@/app/admin/ferie/actions";
import {
  SpreadsheetGrid,
  type CellChange,
  type CellState,
  type FooterRow,
  type GridColumn,
  type GridRow,
  type SaveState,
} from "@/components/spreadsheet";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { formatLeaveCell, parseLeaveCell } from "@/lib/leaves/parse";
import {
  MONTH_NAMES,
  countOnLeaveByDay,
  daysOverThreshold,
  exceedsThreshold,
  formatDayIt,
  isWeekendDate,
  monthDates,
  weekdayLetter,
  yearDates,
} from "@/lib/leaves/plan";
import { cn } from "@/lib/utils";
import { LeaveCalendar, type DayRange } from "./leave-calendar";
import { LeaveDayDialog } from "./leave-day-dialog";
import { LeaveRangeBar } from "./leave-range-bar";
import { ThresholdsDialog } from "./thresholds-dialog";
import {
  cellText,
  leaveDescription,
  type PlannerDepartment,
  type PlannerHoliday,
  type PlannerLeave,
  type PlannerMode,
  type PlannerPerson,
  type PlannerPeriod,
  type PlannerView,
} from "./types";

export type LeavePlannerProps = {
  mode: PlannerMode;
  year: number;
  today: string;
  people: PlannerPerson[];
  departments: PlannerDepartment[];
  leaves: PlannerLeave[];
  holidays: PlannerHoliday[];
  thresholds: Record<string, number>;
  meId?: string;
  initial: { view: PlannerView; period: PlannerPeriod; month: number; department: string };
};

const key = (profileId: string, date: string) => `${profileId}|${date}`;

/**
 * Foglio ferie (§8.2): le due viste dello stesso dato, "Persone × giorni" e "Calendario annuale".
 * L'admin modifica; il dipendente vede lo stesso foglio in sola lettura (dati pubblici).
 */
export function LeavePlanner(props: LeavePlannerProps) {
  const { mode, year, today, people, departments, leaves, holidays, thresholds, meId } = props;
  const admin = mode === "admin";
  const router = useRouter();

  const [view, setView] = React.useState<PlannerView>(props.initial.view);
  const [period, setPeriod] = React.useState<PlannerPeriod>(props.initial.period);
  const [month, setMonth] = React.useState(props.initial.month);
  const [department, setDepartment] = React.useState(props.initial.department);
  const [selection, setSelection] = React.useState<DayRange | null>(null);
  const [dayDialog, setDayDialog] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Map<string, string>>(new Map());
  const [, startTransition] = React.useTransition();
  const gridWrap = React.useRef<HTMLDivElement>(null);

  // Le modifiche ottimistiche valgono finché il server non restituisce i dati aggiornati.
  const [lastLeaves, setLastLeaves] = React.useState(leaves);
  if (lastLeaves !== leaves) {
    setLastLeaves(leaves);
    setPending(new Map());
  }

  // Stato della vista nell'URL (ricaricando la pagina si resta dove si era).
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("vista", view);
    params.set("periodo", period);
    params.set("mese", String(month));
    if (department) params.set("reparto", department);
    else params.delete("reparto");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [view, period, month, department]);

  /* ----------------------------------------------------------- dati derivati */

  const holidayMap = React.useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);
  const deptName = React.useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const visiblePeople = React.useMemo(
    () => (department ? people.filter((p) => p.departmentIds.includes(department)) : people),
    [people, department],
  );
  const visibleIds = React.useMemo(() => new Set(visiblePeople.map((p) => p.id)), [visiblePeople]);
  const primaryOf = React.useMemo(
    () => new Map(people.map((p) => [p.id, p.primaryDepartmentId])),
    [people],
  );

  /** Dati del server con sopra le modifiche non ancora confermate. */
  const effective = React.useMemo(() => {
    const map = new Map(leaves.map((l) => [key(l.profileId, l.date), l]));
    for (const [k, value] of pending) {
      const [profileId, date] = k.split("|");
      const parsed = parseLeaveCell(value);
      if (parsed.kind === "leave") {
        map.set(k, {
          profileId,
          date,
          type: parsed.type,
          status: parsed.status,
          hours: parsed.hours,
          source: "planning",
        });
      } else if (parsed.kind === "empty") {
        map.delete(k);
      }
    }
    return map;
  }, [leaves, pending]);

  const visibleLeaves = React.useMemo(
    () => [...effective.values()].filter((l) => visibleIds.has(l.profileId)),
    [effective, visibleIds],
  );

  const byDate = React.useMemo(() => {
    const map = new Map<string, PlannerLeave[]>();
    for (const l of visibleLeaves) map.set(l.date, [...(map.get(l.date) ?? []), l]);
    return map;
  }, [visibleLeaves]);

  const counts = React.useMemo(
    () => countOnLeaveByDay(visibleLeaves, (id) => primaryOf.get(id)),
    [visibleLeaves, primaryOf],
  );

  const overThreshold = React.useMemo(
    () => daysOverThreshold(counts, thresholds),
    [counts, thresholds],
  );

  /* ---------------------------------------------------------------- griglia */

  const groups = React.useMemo(() => {
    const known = new Set(departments.map((d) => d.id));
    const out = departments
      .map((d) => ({
        id: d.id,
        label: d.name,
        people: visiblePeople.filter((p) => p.primaryDepartmentId === d.id),
      }))
      .filter((g) => g.people.length > 0);
    const orphans = visiblePeople.filter(
      (p) => !p.primaryDepartmentId || !known.has(p.primaryDepartmentId),
    );
    if (orphans.length) out.push({ id: "senza-reparto", label: "Senza reparto", people: orphans });
    return out;
  }, [departments, visiblePeople]);

  const rows: GridRow[] = React.useMemo(
    () =>
      groups.flatMap((g) =>
        g.people.map((p) => {
          const others = p.departmentIds
            .filter((d) => d !== p.primaryDepartmentId)
            .map((d) => deptName.get(d))
            .filter(Boolean);
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

  const dates = React.useMemo(
    () => (period === "anno" ? yearDates(year) : monthDates(year, month)),
    [period, year, month],
  );

  const columns: GridColumn[] = React.useMemo(
    () =>
      dates.map((d) => {
        const day = Number(d.slice(8));
        const m = Number(d.slice(5, 7));
        const holiday = holidayMap.get(d);
        return {
          id: d,
          label: String(day),
          sublabel:
            period === "anno" && day === 1
              ? MONTH_NAMES[m - 1].slice(0, 3).toLowerCase()
              : weekdayLetter(d),
          width: period === "anno" ? 40 : admin ? 52 : 64,
          highlight: d === today,
          shaded: isWeekendDate(d) || Boolean(holiday),
        };
      }),
    [dates, holidayMap, period, today, admin],
  );

  const getValue = React.useCallback(
    (profileId: string, date: string) => {
      const k = key(profileId, date);
      if (pending.has(k)) return pending.get(k)!;
      const leave = effective.get(k);
      return leave ? cellText(leave, mode) : "";
    },
    [pending, effective, mode],
  );

  const getCellState = React.useCallback(
    (profileId: string, date: string): CellState | undefined => {
      const leave = effective.get(key(profileId, date));
      const holiday = holidayMap.get(date);
      if (!leave) return holiday ? { title: holiday.label } : undefined;
      const fromRequest = leave.source === "request";
      return {
        tone:
          leave.status === "tentative" ? "dashed" : leave.type === "ferie" ? "default" : "muted",
        className: leave.type === "ferie" ? "font-medium" : undefined,
        readOnly: fromRequest,
        title: `${leaveDescription(leave, mode)}${fromRequest && admin ? " — doppio clic per modificarla" : ""}`,
      };
    },
    [effective, holidayMap, mode, admin],
  );

  const renderCell = React.useCallback(
    (profileId: string, date: string, value: string) => {
      const leave = effective.get(key(profileId, date));
      // In vista "Anno" le colonne sono strette: per i colleghi bastano F / A.
      const text = !admin && period === "anno" && value ? value.charAt(0) : value;
      return (
        <>
          {text}
          {leave?.source === "request" ? (
            <sup className="ml-px text-[0.5rem] text-muted" aria-label="da richiesta">
              R
            </sup>
          ) : null}
        </>
      );
    },
    [effective, admin, period],
  );

  const normalize = React.useCallback((value: string) => {
    const parsed = parseLeaveCell(value);
    if (parsed.kind === "error") return { error: parsed.message };
    if (parsed.kind === "empty") return { value: "" };
    return { value: formatLeaveCell(parsed) };
  }, []);

  const onChange = React.useCallback(
    (changes: CellChange[]) => {
      setPending((prev) => {
        const next = new Map(prev);
        for (const c of changes) next.set(key(c.rowId, c.colId), c.value);
        return next;
      });
      setSaveState("saving");
      startTransition(async () => {
        const res = await saveLeaveCells({
          changes: changes.map((c) => ({ profileId: c.rowId, date: c.colId, value: c.value })),
        });
        const partial = res.ok && (res.data?.skippedRequests || res.data?.errors);
        setSaveState(res.ok ? "saved" : "error");
        setMessage(!res.ok || partial ? (res.message ?? null) : null);
        router.refresh();
      });
    },
    [router],
  );

  const footerRows: FooterRow[] = React.useMemo(() => {
    const deps = department ? departments.filter((d) => d.id === department) : departments;
    const cellsFor = (fn: (date: string) => number) =>
      Object.fromEntries(dates.map((d) => [d, fn(d) || ""]));
    return [
      {
        id: "in-ferie",
        label: "In ferie",
        cells: cellsFor((d) => counts.get(d)?.total ?? 0),
      },
      ...deps.map((dep) => {
        const limit = thresholds[dep.id];
        return {
          id: `dep-${dep.id}`,
          label: limit != null ? `${dep.name} · max ${limit}` : dep.name,
          cells: cellsFor((d) => counts.get(d)?.byDepartment[dep.id] ?? 0),
          cellClassName: (date: string) =>
            exceedsThreshold(counts.get(date)?.byDepartment[dep.id] ?? 0, limit)
              ? "bg-danger/10 font-semibold text-danger"
              : undefined,
        };
      }),
    ];
  }, [department, departments, dates, counts, thresholds]);

  // In vista "Anno" si parte da oggi (o dall'inizio del mese scelto).
  React.useEffect(() => {
    if (view !== "persone" || period !== "anno") return;
    const grid = gridWrap.current?.querySelector<HTMLElement>("[role=grid]");
    if (!grid) return;
    const target = today.startsWith(`${year}-`)
      ? today
      : `${year}-${String(month).padStart(2, "0")}-01`;
    const index = dates.indexOf(target);
    if (index > 0) grid.scrollLeft = Math.max(0, (index - 3) * 40);
  }, [view, period, dates, today, year, month]);

  /** Sola lettura: il dipendente seleziona un intervallo sulla griglia per chiedere le ferie. */
  // La griglia annuncia anche la selezione iniziale: conta solo dopo un'azione dell'utente.
  const selectionReady = React.useRef(false);
  const onGridSelection = React.useCallback(
    ({ colIds }: { rowIds: string[]; colIds: string[] }) => {
      if (!selectionReady.current) {
        selectionReady.current = true;
        return;
      }
      if (admin || colIds.length === 0) return;
      const sorted = [...colIds].sort();
      setSelection({ from: sorted[0], to: sorted[sorted.length - 1] });
    },
    [admin],
  );

  const refresh = React.useCallback(() => router.refresh(), [router]);

  /* --------------------------------------------------------------- render */

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Vista" className="flex border border-foreground">
          <ToggleButton
            active={view === "persone"}
            onClick={() => setView("persone")}
            icon={<Grid3x3 aria-hidden className="size-4 stroke-[1.5]" />}
          >
            Persone × giorni
          </ToggleButton>
          <ToggleButton
            active={view === "calendario"}
            onClick={() => setView("calendario")}
            icon={<CalendarRange aria-hidden className="size-4 stroke-[1.5]" />}
            className="border-l border-foreground"
          >
            Calendario
          </ToggleButton>
        </div>

        {view === "persone" ? (
          <>
            <div role="radiogroup" aria-label="Periodo" className="flex border border-line-strong">
              <ToggleButton active={period === "mese"} onClick={() => setPeriod("mese")}>
                Mese
              </ToggleButton>
              <ToggleButton
                active={period === "anno"}
                onClick={() => setPeriod("anno")}
                className="border-l border-line-strong"
              >
                Anno
              </ToggleButton>
            </div>
            <Select
              aria-label="Mese"
              value={String(month)}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-40"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {period === "anno" ? `Da ${name.toLowerCase()}` : name}
                </option>
              ))}
            </Select>
          </>
        ) : null}

        <Select
          aria-label="Reparto"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-48"
        >
          <option value="">Tutti i reparti</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        <div className="ml-auto flex flex-wrap gap-2">
          {admin ? (
            <ThresholdsDialog departments={departments} thresholds={thresholds} onSaved={refresh} />
          ) : null}
          {admin ? (
            <Button asChild variant="secondary" size="sm">
              <a href={exportHref(year, "xlsx", department)}>
                <FileSpreadsheet aria-hidden /> Excel
              </a>
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <a href={exportHref(year, "pdf", department)}>
              <FileDown aria-hidden /> PDF
            </a>
          </Button>
        </div>
      </div>

      {admin && overThreshold.length > 0 ? (
        <p className="border-l-2 border-danger pl-3 text-sm text-danger">
          Soglia superata in {new Set(overThreshold.map((o) => o.date)).size}{" "}
          {new Set(overThreshold.map((o) => o.date)).size === 1 ? "giorno" : "giorni"}:{" "}
          {overThreshold
            .slice(0, 6)
            .map((o) => `${formatDayIt(o.date)} (${deptName.get(o.departmentId)} ${o.count})`)
            .join(", ")}
          {overThreshold.length > 6 ? "…" : ""}
        </p>
      ) : null}

      {message ? (
        <p role="alert" className="border-l-2 border-warning pl-3 text-sm text-warning">
          {message}
        </p>
      ) : null}

      {view === "persone" ? (
        <div ref={gridWrap} style={{ "--grid-max-height": "70vh" } as React.CSSProperties}>
          <SpreadsheetGrid
            onSelectionChange={onGridSelection}
            ariaLabel={`Planning ferie ${year}`}
            rows={rows}
            columns={columns}
            groups={groups.map((g) => ({ id: g.id, label: g.label, collapsible: true }))}
            getValue={getValue}
            getCellState={getCellState}
            renderCell={renderCell}
            normalize={admin ? normalize : undefined}
            onChange={admin ? onChange : undefined}
            readOnly={!admin}
            onCellActivate={admin ? (_profileId, date) => setDayDialog(date) : undefined}
            footerRows={footerRows}
            rowHeaderLabel="Persona"
            saveState={admin ? saveState : "idle"}
            highlightRowId={meId}
            showDensityToggle
          />
          <Legend admin={admin} />
        </div>
      ) : (
        <>
          <LeaveCalendar
            year={year}
            today={today}
            mode={mode}
            people={visiblePeople}
            byDate={byDate}
            holidays={holidayMap}
            selection={selection}
            onSelectionChange={setSelection}
            onDayClick={admin ? setDayDialog : undefined}
            meId={meId}
          />
          <Legend admin={admin} calendar />
        </>
      )}

      {selection && (admin ? view === "calendario" && selection.from !== selection.to : true) ? (
        <LeaveRangeBar
          mode={mode}
          range={selection}
          people={visiblePeople}
          onClear={() => setSelection(null)}
          onSaved={refresh}
        />
      ) : null}

      {admin && dayDialog ? (
        <LeaveDayDialog
          date={dayDialog}
          entries={people
            .map((p) => effective.get(key(p.id, dayDialog)))
            .filter((l): l is PlannerLeave => Boolean(l))}
          people={people}
          onClose={() => setDayDialog(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function exportHref(year: number, format: "xlsx" | "pdf", department: string) {
  const params = new URLSearchParams({ formato: format });
  if (department) params.set("reparto", department);
  return `/api/export/ferie/${year}?${params}`;
}

function ToggleButton({
  active,
  onClick,
  icon,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center gap-2 px-3 text-sm",
        active ? "bg-foreground text-background" : "hover:bg-surface",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Legend({ admin, calendar }: { admin: boolean; calendar?: boolean }) {
  return (
    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      {admin && !calendar ? (
        <>
          <span>
            Digita <b className="font-medium text-foreground">F</b> ferie,{" "}
            <b className="font-medium text-foreground">F?</b> da confermare,{" "}
            <b className="font-medium text-foreground">PE</b> permesso (
            <span className="nums">PE4</span> = 4 ore),{" "}
            <b className="font-medium text-foreground">MA</b> malattia,{" "}
            <b className="font-medium text-foreground">A</b> altra assenza. Canc svuota; trascina la
            maniglia per riempire.
          </span>
        </>
      ) : null}
      {admin && calendar ? (
        <span>
          Clic su un giorno per aggiungere o togliere persone. Shift+clic o trascina per scegliere
          un periodo.
        </span>
      ) : null}
      {!admin ? (
        <span>
          {calendar
            ? "Seleziona un giorno o un periodo (Shift+clic o trascina) per chiedere le ferie."
            : "Seleziona uno o più giorni per chiedere le ferie in quel periodo."}
        </span>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-3 w-5 rounded-sm border border-dashed border-warning"
        />
        da confermare
      </span>
      {admin ? (
        <span>
          <sup>R</sup> da richiesta approvata{calendar ? "" : ": doppio clic per modificarla"}
        </span>
      ) : null}
    </p>
  );
}
