"use client";

/**
 * Un giorno del foglio orario (§8.1): righe ORARIO, ore 07–22 a mezze celle, TOT, indicatori.
 * Lo stato del trascinamento è locale al blocco: mentre si dipinge si rirenderizza solo questo giorno.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeCoverage, coverageByHour, dailyTotals, type CoverageSlot } from "@/lib/coverage";
import type { DepartmentRef, Interval, PersonInput, ShiftInput } from "@/lib/domain/types";
import {
  emptyMarks,
  isSlotOutsideOpening,
  marksFromShifts,
  shiftsFromMarks,
  TIMESHEET_HOURS,
  type LeaveFill,
  type ZoneGroupId,
} from "@/lib/export/timesheet-model";
import { formatHours } from "@/lib/hours";
import { SLOT_COUNT, slotTime, type SlotMark } from "@/lib/shifts/slots";
import { cn } from "@/lib/utils";

export type TimesheetColumn = {
  id: string;
  displayName: string;
  shortLabel: string;
  zone: ZoneGroupId;
};

export type DayLeave = { fill: LeaveFill; label: string; locked: boolean } | null;

export type DayData = {
  date: string;
  /** "mar 20". */
  label: string;
  closed: boolean;
  holidayLabel: string | null;
  opening: Interval | null;
  /** Turni effettivi del giorno (con le modifiche ottimistiche). */
  inputs: ShiftInput[];
  /** Per colonna. */
  residual: (number | null)[];
  leaves: DayLeave[];
};

export type Brush = "sale" | "bo";

type Drag = {
  col: number;
  from: number;
  to: number;
  erase: boolean;
  mark: Exclude<SlotMark, null>;
};

export const COL_WIDTH = { date: 26, hour: 44, person: 44, indicator: 36 } as const;
const INDICATORS = [
  { key: "copOtt", label: "Cop. ott.", hint: "COP. OTT." },
  { key: "delta", label: "Delta", hint: "DELTA" },
  { key: "teste", label: "Teste", hint: "TESTE" },
  { key: "vista", label: "Vista", hint: "Vista" },
  { key: "sole", label: "Sole", hint: "Sole" },
] as const;

const LEAVE_CLASS: Record<LeaveFill, string> = {
  ferie: "bg-danger/10",
  request: "bg-success/10",
  pending: "bg-success/5 outline-1 -outline-offset-1 outline-dashed outline-success/60",
  other: "bg-line/60",
};

const zoneTint = (zone: ZoneGroupId) =>
  zone === "vista" ? "bg-vista/10" : zone === "sole" ? "bg-sole/10" : "bg-surface";

export function TimesheetColGroup({ count }: { count: number }) {
  return (
    <colgroup>
      <col style={{ width: COL_WIDTH.date }} />
      <col style={{ width: COL_WIDTH.hour }} />
      {Array.from({ length: count }, (_, i) => (
        <col key={i} style={{ width: COL_WIDTH.person }} />
      ))}
      {INDICATORS.map((ind) => (
        <col key={ind.key} style={{ width: COL_WIDTH.indicator }} />
      ))}
    </colgroup>
  );
}

export function tableWidth(count: number) {
  return (
    COL_WIDTH.date +
    COL_WIDTH.hour +
    count * COL_WIDTH.person +
    INDICATORS.length * COL_WIDTH.indicator
  );
}

/** Applica il trascinamento alle mezze celle di partenza. */
function applyDrag(base: SlotMark[], drag: Drag): SlotMark[] {
  const lo = Math.min(drag.from, drag.to);
  const hi = Math.max(drag.from, drag.to);
  return base.map((m, i) => (i >= lo && i <= hi ? (drag.erase ? null : drag.mark) : m));
}

const sameMarks = (a: SlotMark[], b: SlotMark[]) => a.every((m, i) => m === b[i]);

const cellId = (date: string, col: number, slot: number) => `ts-${date}-${col}-${slot}`;

function slotTitle(s: CoverageSlot) {
  return `${s.start}–${s.end} · TESTE ${s.teste} · DELTA ${s.delta} · Vista ${s.vista} · Sole ${s.sole} · Ottici in vendita ${s.ottici}`;
}

/** In quale colonna indicatore mostrare un avviso, dal testo del messaggio. */
function indicatorForMessage(message: string): string[] {
  const m = message.toLowerCase();
  const out: string[] = [];
  if (m.includes("cop") || m.includes("ottic")) out.push("copOtt");
  if (m.includes("vista")) out.push("vista");
  if (m.includes("sole")) out.push("sole");
  if (out.length === 0) out.push("delta", "teste");
  return out;
}

type DayBlockProps = {
  day: DayData;
  columns: TimesheetColumn[];
  people: PersonInput[];
  departments: DepartmentRef[];
  isToday: boolean;
  prevDate: string | null;
  nextDate: string | null;
  readOnly: boolean;
  brush: Brush;
  onToggleBrush: () => void;
  onCommit: (profileId: string, date: string, marks: SlotMark[], debounceMs: number) => void;
  violationsByDaySlot?: (date: string, start: string) => string | undefined;
};

export const TimesheetDay = memo(function TimesheetDay({
  day,
  columns,
  people,
  departments,
  isToday,
  prevDate,
  nextDate,
  readOnly,
  brush,
  onToggleBrush,
  onCommit,
  violationsByDaySlot,
}: DayBlockProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [active, setActive] = useState<{ col: number; slot: number }>({ col: 0, slot: 6 });
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  /** Mezze celle salvate (o in salvataggio) per persona. */
  const baseMarks = useMemo(() => {
    const byPerson = new Map<string, ShiftInput[]>();
    for (const s of day.inputs)
      byPerson.set(s.profileId, [...(byPerson.get(s.profileId) ?? []), s]);
    return columns.map((c) => {
      const list = byPerson.get(c.id);
      return list ? marksFromShifts(list) : emptyMarks();
    });
  }, [day.inputs, columns]);

  const marks = useMemo(
    () => (drag ? baseMarks.map((m, i) => (i === drag.col ? applyDrag(m, drag) : m)) : baseMarks),
    [baseMarks, drag],
  );

  // Turni del giorno con l'anteprima del trascinamento: indicatori e TOT si aggiornano dal vivo.
  const inputs = useMemo(() => {
    if (!drag) return day.inputs;
    const pid = columns[drag.col].id;
    const own = day.inputs.filter((s) => s.profileId === pid);
    const first = own[0];
    return [
      ...day.inputs.filter((s) => s.profileId !== pid),
      ...shiftsFromMarks(marks[drag.col], {
        profileId: pid,
        date: day.date,
        zone: first?.zone ?? null,
        departmentId: first?.departmentId ?? null,
        breakMinutes: own.length === 1 ? own[0].breakMinutes : 0,
      }),
    ];
  }, [drag, day.inputs, day.date, columns, marks]);

  const halfCoverage = useMemo(
    () => computeCoverage({ date: day.date, shifts: inputs, people, departments }),
    [day.date, inputs, people, departments],
  );
  const hourly = useMemo(() => coverageByHour(halfCoverage), [halfCoverage]);
  const totals = useMemo(() => dailyTotals(day.date, inputs), [day.date, inputs]);

  // --- Trascinamento -------------------------------------------------------------------------

  const finishDrag = useCallback(
    (commit: boolean) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      if (!commit) return;
      const next = applyDrag(baseMarks[d.col], d);
      if (!sameMarks(next, baseMarks[d.col])) onCommit(columns[d.col].id, day.date, next, 0);
    },
    [baseMarks, columns, day.date, onCommit],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const el = (
        document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      )?.closest<HTMLElement>("[data-slot]");
      if (!el || el.dataset.date !== day.date) return;
      const slot = Number(el.dataset.slot);
      setDrag((d) => (d && d.to !== slot ? { ...d, to: slot } : d));
    };
    const onUp = () => finishDrag(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishDrag(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [drag, day.date, finishDrag]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!el) return;
    const col = Number(el.dataset.col);
    const slot = Number(el.dataset.slot);
    if (day.leaves[col]?.locked) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    setActive({ col, slot });
    // Il primo clic decide: se la mezza cella ha già il segno del pennello si cancella, altrimenti si dipinge.
    const current = baseMarks[col][slot];
    setDrag({ col, from: slot, to: slot, erase: current === brush, mark: brush });
  };

  // --- Tastiera ------------------------------------------------------------------------------

  const focusCell = (date: string, col: number, slot: number) => {
    document.getElementById(cellId(date, col, slot))?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!el || e.altKey || e.ctrlKey || e.metaKey) return;
    const col = Number(el.dataset.col);
    const slot = Number(el.dataset.slot);
    const move = (dCol: number, dSlot: number) => {
      const s = slot + dSlot;
      const c = Math.max(0, Math.min(columns.length - 1, col + dCol));
      if (s < 0) {
        if (prevDate) focusCell(prevDate, c, SLOT_COUNT + s);
      } else if (s >= SLOT_COUNT) {
        if (nextDate) focusCell(nextDate, c, s - SLOT_COUNT);
      } else focusCell(day.date, c, s);
    };
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        return move(0, -1);
      case "ArrowDown":
        e.preventDefault();
        return move(0, 1);
      case "ArrowLeft":
        e.preventDefault();
        return move(-1, 0);
      case "ArrowRight":
        e.preventDefault();
        return move(1, 0);
    }
    if (readOnly || day.leaves[col]?.locked) return;
    const hourStart = slot - (slot % 2);
    const current = baseMarks[col];
    let next: SlotMark[] | null = null;
    let advance = false;
    if (e.key === "1") {
      next = current.map((m, i) => (i === hourStart || i === hourStart + 1 ? brush : m));
      advance = true;
    } else if (e.key === "." || e.key === "," || e.key === "5") {
      next = current.map((m, i) =>
        i === slot ? brush : i === hourStart || i === hourStart + 1 ? null : m,
      );
      advance = true;
    } else if (e.key === "Delete" || e.key === "Backspace") {
      next = current.map((m, i) => (i === hourStart || i === hourStart + 1 ? null : m));
    } else if (e.key === "b" || e.key === "B") {
      const hour = [current[hourStart], current[hourStart + 1]];
      if (hour.every((m) => m === null)) {
        e.preventDefault();
        onToggleBrush();
        return;
      }
      const target = hour.includes("sale") ? "bo" : "sale";
      next = current.map((m, i) =>
        (i === hourStart || i === hourStart + 1) && m !== null ? target : m,
      );
    }
    if (!next) return;
    e.preventDefault();
    if (!sameMarks(next, current)) onCommit(columns[col].id, day.date, next, 700);
    if (advance) move(0, 2);
  };

  // --- Rendering -----------------------------------------------------------------------------

  const violationFor = (slotIndex: number) => violationsByDaySlot?.(day.date, slotTime(slotIndex));
  const rowCount = TIMESHEET_HOURS.length + 3;

  return (
    <tbody
      className={cn("select-none", day.closed && "opacity-50")}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      aria-label={`${day.label}${day.closed ? " · negozio chiuso" : ""}`}
    >
      {/* Intestazione del giorno: sigle delle persone. */}
      <tr
        className={cn("border-t-2", isToday ? "border-t-4 border-foreground" : "border-foreground")}
      >
        <th
          rowSpan={rowCount}
          scope="rowgroup"
          className="border-r border-line-strong bg-background p-0 align-middle"
        >
          <span className="mx-auto block rotate-180 py-2 text-center font-display text-xs font-semibold tracking-[0.08em] uppercase [writing-mode:vertical-rl]">
            {day.label}
            {day.holidayLabel ? (
              <span className="font-normal text-muted"> · {day.holidayLabel}</span>
            ) : null}
            {day.closed ? <span className="font-normal text-muted"> · chiuso</span> : null}
          </span>
        </th>
        <th scope="col" className="px-1 text-left eyebrow text-[0.625rem]">
          Ora
        </th>
        {columns.map((c) => (
          <th
            key={c.id}
            scope="col"
            title={c.displayName}
            className={cn(
              "truncate border-l border-line px-0.5 py-1 text-center text-[0.625rem] font-semibold tracking-wide",
              zoneTint(c.zone),
            )}
          >
            {c.shortLabel}
          </th>
        ))}
        {INDICATORS.map((ind) => (
          <th
            key={ind.key}
            scope="col"
            className={cn(
              "border-l border-line px-0.5 text-center text-[0.5625rem] font-semibold tracking-wide uppercase",
              ind.key === "vista" && "bg-vista/10",
              ind.key === "sole" && "bg-sole/10",
            )}
          >
            {ind.label}
          </th>
        ))}
      </tr>

      {/* ORARIO: ore residue della settimana prima di questo giorno. */}
      <tr className="border-b border-line-strong">
        <th scope="row" className="px-1 text-left text-[0.625rem] font-semibold tracking-wide">
          ORARIO
        </th>
        {columns.map((c, i) => {
          const v = day.residual[i];
          return (
            <td
              key={c.id}
              title={
                v === null ? "Ore di contratto non indicate" : `Ore residue prima di ${day.label}`
              }
              className={cn(
                "border-l border-line text-center text-xs font-semibold nums",
                v !== null && v < 0 ? "text-danger" : v === 0 ? "text-muted" : "",
              )}
            >
              {v === null ? "—" : formatHours(v)}
            </td>
          );
        })}
        <td colSpan={INDICATORS.length} className="border-l border-line" />
      </tr>

      {TIMESHEET_HOURS.map((hour, h) => {
        const first = h * 2;
        const ind = hourly[h];
        const halves = [halfCoverage[first], halfCoverage[first + 1]];
        const messages = [violationFor(first), violationFor(first + 1)].filter((m): m is string =>
          Boolean(m),
        );
        const flagged = new Set(messages.flatMap(indicatorForMessage));
        const detail = halves.map(slotTitle).join("\n");
        const outsideHour =
          isSlotOutsideOpening(first, day.opening) && isSlotOutsideOpening(first + 1, day.opening);
        return (
          <tr key={hour} className="border-b border-line">
            <th
              scope="row"
              className={cn(
                "px-1 text-left text-[0.6875rem] font-normal text-muted nums",
                outsideHour && "bg-surface",
              )}
            >
              {String(hour).padStart(2, "0")}:00
            </th>
            {columns.map((c, col) => {
              const leave = day.leaves[col];
              return (
                <td
                  key={c.id}
                  className={cn("border-l border-line p-0", leave && LEAVE_CLASS[leave.fill])}
                >
                  {[first, first + 1].map((slot) => (
                    <HalfCell
                      key={slot}
                      id={cellId(day.date, col, slot)}
                      date={day.date}
                      col={col}
                      slot={slot}
                      mark={marks[col][slot]}
                      outside={isSlotOutsideOpening(slot, day.opening)}
                      leave={leave}
                      tabbable={active.col === col && active.slot === slot}
                      readOnly={readOnly}
                      label={`${c.displayName}, ${day.label}, ${slotTime(slot)}–${slotTime(slot + 1)}`}
                      onFocus={setActive}
                    />
                  ))}
                </td>
              );
            })}
            {INDICATORS.map((it) => {
              const bad = flagged.has(it.key);
              const value = ind[it.key as keyof CoverageSlot];
              const title = [
                `${it.hint} ${String(hour).padStart(2, "0")}–${String(hour + 1).padStart(2, "0")} (minimo delle due mezz'ore)`,
                detail,
                ...messages,
              ].join("\n");
              return (
                <td
                  key={it.key}
                  title={title}
                  className={cn(
                    "border-l border-line text-center text-xs nums",
                    outsideHour && "bg-surface text-subtle",
                    it.key === "copOtt" && !ind.copOtt && !outsideHour && "text-danger",
                    bad && "bg-danger/8 text-danger",
                  )}
                >
                  {it.key === "copOtt" ? (
                    <span aria-label={ind.copOtt ? "Coperto" : "Scoperto"}>
                      {ind.copOtt ? "✓" : "✗"}
                    </span>
                  ) : (
                    String(value)
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}

      {/* TOT: ore del giorno per persona e totale del negozio. */}
      <tr className="border-t border-foreground">
        <th scope="row" className="px-1 text-left text-[0.625rem] font-semibold tracking-wide">
          TOT
        </th>
        {columns.map((c, i) => {
          const leave = day.leaves[i];
          const v = totals.byPerson[c.id] ?? 0;
          return (
            <td
              key={c.id}
              title={leave?.label}
              className={cn(
                "truncate border-l border-line px-0.5 py-1 text-center text-xs font-semibold nums",
                leave && LEAVE_CLASS[leave.fill],
                leave && "text-[0.5625rem] font-normal text-muted uppercase",
              )}
            >
              {leave && !v ? leave.label : v ? formatHours(v) : ""}
            </td>
          );
        })}
        <td
          colSpan={INDICATORS.length}
          className="border-l border-line px-2 text-right text-xs nums"
          title="Ore del negozio nel giorno"
        >
          <span className="text-muted">Tot. </span>
          <span className="font-semibold">{formatHours(totals.total)}</span>
        </td>
      </tr>
    </tbody>
  );
});

type HalfCellProps = {
  id: string;
  date: string;
  col: number;
  slot: number;
  mark: SlotMark;
  outside: boolean;
  leave: DayLeave;
  tabbable: boolean;
  readOnly: boolean;
  label: string;
  onFocus: (pos: { col: number; slot: number }) => void;
};

/** Una mezza cella da 30': nero pieno = vendita, righe diagonali = back office. */
const HalfCell = memo(function HalfCell({
  id,
  date,
  col,
  slot,
  mark,
  outside,
  leave,
  tabbable,
  readOnly,
  label,
  onFocus,
}: HalfCellProps) {
  const state = mark === "sale" ? "presente" : mark === "bo" ? "back office" : "vuoto";
  const locked = Boolean(leave?.locked);
  return (
    <button
      type="button"
      id={id}
      data-date={date}
      data-col={col}
      data-slot={slot}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${label}: ${state}${leave ? ` (${leave.label})` : ""}`}
      aria-disabled={locked || readOnly || undefined}
      onFocus={() => onFocus({ col, slot })}
      className={cn(
        "relative block h-[11px] w-full focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground focus-visible:outline-solid",
        slot % 2 === 1 && "border-b border-dotted border-line",
        !readOnly && !locked && "cursor-crosshair touch-none",
        locked && "cursor-not-allowed",
        mark === "sale" && "bg-foreground",
        mark === "bo" && "bg-background hatch text-foreground",
        !mark && outside && !leave && "bg-surface",
        mark === "sale" && focusRingInverse,
      )}
    />
  );
});

/** Sul nero pieno il contorno nero non si vede: lo si rende con il colore dello sfondo. */
const focusRingInverse = "focus-visible:outline-background";
