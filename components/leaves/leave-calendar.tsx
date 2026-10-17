"use client";

import * as React from "react";
import {
  MONTH_NAMES,
  dateRange,
  isWeekendDate,
  monthDates,
  weekdayLetter,
} from "@/lib/leaves/plan";
import { cn } from "@/lib/utils";
import {
  chipSuffix,
  leaveDescription,
  type PlannerHoliday,
  type PlannerLeave,
  type PlannerMode,
  type PlannerPerson,
} from "./types";

export type DayRange = { from: string; to: string };

type Props = {
  year: number;
  today: string;
  mode: PlannerMode;
  people: PlannerPerson[];
  /** Assenze per giorno, già filtrate per reparto. */
  byDate: Map<string, PlannerLeave[]>;
  holidays: Map<string, PlannerHoliday>;
  selection: DayRange | null;
  onSelectionChange: (range: DayRange | null) => void;
  /** Clic semplice su un giorno (senza Shift e senza trascinare). */
  onDayClick?: (date: string) => void;
  meId?: string;
};

const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/**
 * Vista "Calendario annuale" come l'Excel attuale (§8.2): 12 blocchi mese, una riga per giorno
 * con le persone in ferie. Clic su un giorno, Shift+clic o trascinamento per un periodo.
 */
export function LeaveCalendar({
  year,
  today,
  mode,
  people,
  byDate,
  holidays,
  selection,
  onSelectionChange,
  onDayClick,
  meId,
}: Props) {
  const peopleById = React.useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const order = React.useMemo(() => new Map(people.map((p, i) => [p.id, i])), [people]);
  const anchor = React.useRef<string | null>(null);
  const drag = React.useRef<{ start: string; moved: boolean } | null>(null);

  const selected = React.useMemo(
    () => (selection ? new Set(dateRange(selection.from, selection.to)) : new Set<string>()),
    [selection],
  );

  const select = React.useCallback(
    (a: string, b: string) => onSelectionChange(a <= b ? { from: a, to: b } : { from: b, to: a }),
    [onSelectionChange],
  );

  const dateFrom = (el: Element | null) =>
    el?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const date = dateFrom(e.target as Element);
    if (!date) return;
    if (e.shiftKey && anchor.current) {
      e.preventDefault();
      select(anchor.current, date);
      return;
    }
    anchor.current = date;
    drag.current = { start: date, moved: false };
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const over = dateFrom(document.elementFromPoint?.(ev.clientX, ev.clientY) ?? null);
      if (!over || (over === d.start && !d.moved)) return;
      d.moved = true;
      select(d.start, over);
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      const d = drag.current;
      drag.current = null;
      return d;
    };
    const onUp = () => {
      const d = cleanup();
      if (d && !d.moved) {
        select(d.start, d.start);
        onDayClick?.(d.start);
      }
    };
    // Su telefono lo scorrimento della pagina annulla il puntatore: non è un clic.
    const onCancel = () => void cleanup();
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  };

  const onKeyDown = (e: React.KeyboardEvent, date: string) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (e.shiftKey && anchor.current) {
      select(anchor.current, date);
      return;
    }
    anchor.current = date;
    select(date, date);
    onDayClick?.(date);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      className="grid gap-x-6 gap-y-10 select-none sm:grid-cols-2 lg:grid-cols-4"
    >
      {MONTH_NAMES.map((name, m) => (
        <section key={name} aria-label={`${name} ${year}`} className="min-w-0">
          <h3 className="mb-2 border-b border-foreground pb-1.5 eyebrow text-foreground">{name}</h3>
          <ol className="text-[0.8125rem]">
            {monthDates(year, m + 1).map((date) => {
              const day = Number(date.slice(8));
              const holiday = holidays.get(date);
              const shaded = isWeekendDate(date) || Boolean(holiday);
              const isToday = date === today;
              const list = [...(byDate.get(date) ?? [])].sort(
                (a, b) => (order.get(a.profileId) ?? 0) - (order.get(b.profileId) ?? 0),
              );
              const names = list
                .map((l) => peopleById.get(l.profileId)?.displayName)
                .filter(Boolean)
                .join(", ");
              const weekday = WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
              return (
                <li
                  key={date}
                  data-date={date}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected.has(date)}
                  aria-label={`${day} ${name.toLowerCase()}, ${weekday}${holiday ? `, ${holiday.label}` : ""}: ${names || "nessuno in ferie"}`}
                  title={holiday?.label}
                  onKeyDown={(e) => onKeyDown(e, date)}
                  className={cn(
                    "relative flex min-h-7 cursor-pointer items-start gap-2 border-b border-line px-1 py-1 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground",
                    shaded && "bg-surface",
                    selected.has(date) && "bg-foreground/10",
                    isToday && "shadow-[inset_3px_0_0_var(--foreground)]",
                  )}
                >
                  <span
                    className={cn(
                      "w-5 shrink-0 text-right leading-5 nums",
                      isToday ? "font-semibold" : "text-muted",
                    )}
                  >
                    {day}
                  </span>
                  <span
                    className={cn(
                      "w-3 shrink-0 leading-5",
                      shaded ? "text-foreground" : "text-subtle",
                    )}
                  >
                    {weekdayLetter(date)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {list.map((l) => {
                      const person = peopleById.get(l.profileId);
                      if (!person) return null;
                      const suffix = chipSuffix(l, mode);
                      return (
                        <span
                          key={l.profileId}
                          title={`${person.displayName} · ${leaveDescription(l, mode)}`}
                          className={cn(
                            "inline-flex max-w-full items-center gap-1 truncate rounded-sm border border-l-2 px-1 text-[0.6875rem] leading-[1.125rem]",
                            l.status === "tentative"
                              ? "border-dashed border-warning"
                              : "border-line-strong",
                            l.type !== "ferie" && "text-muted",
                            l.profileId === meId && "bg-foreground text-background",
                          )}
                          style={person.color ? { borderLeftColor: person.color } : undefined}
                        >
                          <span className="truncate">{person.displayName}</span>
                          {suffix ? (
                            <span className="text-[0.625rem] opacity-70">{suffix}</span>
                          ) : null}
                          {l.source === "request" ? (
                            <sup className="text-[0.5rem]" aria-label="da richiesta">
                              R
                            </sup>
                          ) : null}
                        </span>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
