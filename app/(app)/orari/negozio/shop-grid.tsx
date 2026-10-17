"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  SpreadsheetGrid,
  type CellState,
  type FooterRow,
  type GridColumn,
  type GridRow,
} from "@/components/spreadsheet";
import { Select } from "@/components/ui/form";
import { toMinutes } from "@/lib/domain/time";
import { publishedDayText } from "@/lib/schedule/cells";
import type { PublishedShift, SchedulePerson } from "@/lib/schedule/types";
import { dayHeader, groupPeopleByDepartment, isWeekend, key } from "@/lib/schedule/view";
import { cn } from "@/lib/utils";

export type DaySummary = {
  present: number;
  closed: boolean;
  minVista: number;
  minSole: number;
  minDelta: number;
  copOtt: boolean;
};

type PublicLeave = { profileId: string; date: string; kind: "ferie" | "assente"; status: string };

/** Griglia generale del negozio in sola lettura (§6.1), con vista per giorno su telefono. */
export function ShopGrid({
  me,
  days,
  today,
  shifts,
  people,
  leaves,
  departments,
  holidays,
  summaries,
  initialDepartment,
}: {
  me: string;
  days: string[];
  today: string;
  shifts: PublishedShift[];
  people: SchedulePerson[];
  leaves: PublicLeave[];
  departments: { id: string; name: string }[];
  holidays: { date: string; label: string; storeClosed: boolean }[];
  summaries: Record<string, DaySummary>;
  initialDepartment: string;
}) {
  const router = useRouter();
  const [department, setDepartment] = useState(initialDepartment);
  const [highlightMe, setHighlightMe] = useState(true);
  const [view, setView] = useState<"griglia" | "giorno">("griglia");
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);

  const visiblePeople = useMemo(
    () => (department ? people.filter((p) => p.departmentIds.includes(department)) : people),
    [people, department],
  );
  const groups = useMemo(
    () => groupPeopleByDepartment(visiblePeople, departments),
    [visiblePeople, departments],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, PublishedShift[]>();
    for (const s of shifts)
      map.set(key(s.profile_id, s.date), [...(map.get(key(s.profile_id, s.date)) ?? []), s]);
    return map;
  }, [shifts]);
  const leaveByDay = useMemo(
    () => new Map(leaves.map((l) => [key(l.profileId, l.date), l])),
    [leaves],
  );
  const holidayByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const rows: GridRow[] = useMemo(
    () =>
      groups.flatMap((g) =>
        g.people.map((p) => ({
          id: p.id,
          label: p.displayName,
          sublabel:
            p.departmentIds.length > 1
              ? `+ ${p.departmentIds
                  .filter((d) => d !== p.primaryDepartmentId)
                  .map((d) => deptName.get(d))
                  .join(", ")}`
              : undefined,
          groupId: g.id,
          accentColor: p.color ?? undefined,
        })),
      ),
    [groups, deptName],
  );

  const columns: GridColumn[] = useMemo(
    () =>
      days.map((d) => {
        const h = dayHeader(d);
        const holiday = holidayByDate.get(d);
        return {
          id: d,
          label: h.label,
          sublabel: holiday?.storeClosed ? `${h.sublabel} · chiuso` : h.sublabel,
          highlight: d === today,
          shaded: isWeekend(d) || Boolean(holiday),
          width: 120,
        };
      }),
    [days, today, holidayByDate],
  );

  const getValue = useCallback(
    (profileId: string, date: string) => {
      const k = key(profileId, date);
      const list = byDay.get(k) ?? [];
      const leave = leaveByDay.get(k);
      if (list.length) return publishedDayText(list);
      if (leave) return leave.kind === "ferie" ? "Ferie" : "Assente";
      return "";
    },
    [byDay, leaveByDay],
  );

  const getCellState = useCallback(
    (profileId: string, date: string): CellState | undefined => {
      const k = key(profileId, date);
      const leave = leaveByDay.get(k);
      if (!byDay.get(k)?.length && leave)
        return { tone: leave.status === "tentative" ? "dashed" : "hatched" };
      if (byDay.get(k)?.some((s) => s.is_absence)) return { tone: "muted" };
      return undefined;
    },
    [byDay, leaveByDay],
  );

  const footerRows: FooterRow[] = useMemo(
    () => [
      {
        id: "presenti",
        label: "Presenti",
        cells: Object.fromEntries(days.map((d) => [d, summaries[d]?.present ?? 0])),
      },
      {
        id: "copertura",
        label: "Copertura minima",
        cells: Object.fromEntries(
          days.map((d) => {
            const s = summaries[d];
            if (!s || s.closed) return [d, "—"];
            return [
              d,
              <span key={d} className="nums">
                V {s.minVista} · S {s.minSole} {s.copOtt ? "· Ott ✓" : "· Ott ✗"}
              </span>,
            ];
          }),
        ),
        cellClassName: (d) =>
          summaries[d] && !summaries[d].closed && !summaries[d].copOtt ? "text-danger" : undefined,
      },
    ],
    [days, summaries],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Vista"
          className="inline-grid grid-cols-2 border border-foreground md:hidden"
        >
          {(["griglia", "giorno"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "min-h-10 px-4 text-sm",
                view === v ? "bg-foreground text-background" : "",
              )}
            >
              {v === "griglia" ? "Settimana" : "Per giorno"}
            </button>
          ))}
        </div>
        <Select
          aria-label="Filtra per reparto"
          className="w-48"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">Tutti i reparti</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={highlightMe}
            onChange={(e) => setHighlightMe(e.target.checked)}
          />
          Evidenzia me
        </label>
      </div>

      <div className={cn(view === "giorno" && "hidden md:block")}>
        <SpreadsheetGrid
          ariaLabel="Turni pubblicati del negozio"
          readOnly
          rows={rows}
          columns={columns}
          groups={groups.map((g) => ({ id: g.id, label: g.label, collapsible: true }))}
          getValue={getValue}
          getCellState={getCellState}
          footerRows={footerRows}
          rowHeaderLabel="Persona"
          highlightRowId={highlightMe ? me : undefined}
          onRowHeaderClick={(id) => router.push(`/persone/${id}`)}
        />
        <p className="mt-3 text-xs text-muted">
          Clicca su un nome per vedere i turni della persona.
        </p>
      </div>

      {view === "giorno" ? (
        <DayView
          days={days}
          day={day}
          onDay={setDay}
          me={highlightMe ? me : null}
          people={visiblePeople}
          byDay={byDay}
          leaveByDay={leaveByDay}
        />
      ) : null}
    </div>
  );
}

const TIMELINE_FROM = 10 * 60;
const TIMELINE_TO = 20 * 60;

/** Vista "per giorno" (mobile): chi lavora, ordinato per orario, con barra 10:00–20:00. */
function DayView({
  days,
  day,
  onDay,
  me,
  people,
  byDay,
  leaveByDay,
}: {
  days: string[];
  day: string;
  onDay: (d: string) => void;
  me: string | null;
  people: SchedulePerson[];
  byDay: Map<string, PublishedShift[]>;
  leaveByDay: Map<string, PublicLeave>;
}) {
  const working = people
    .map((p) => ({
      person: p,
      list: (byDay.get(key(p.id, day)) ?? []).filter((s) => !s.is_absence && s.start_time),
    }))
    .filter((x) => x.list.length > 0)
    .sort((a, b) => (a.list[0].start_time ?? "").localeCompare(b.list[0].start_time ?? ""));
  const away = people.filter(
    (p) => leaveByDay.has(key(p.id, day)) && !byDay.get(key(p.id, day))?.length,
  );
  const span = TIMELINE_TO - TIMELINE_FROM;

  return (
    <div className="md:hidden">
      <div className="-mx-5 mb-4 flex gap-1 overflow-x-auto px-5">
        {days.map((d) => (
          <button
            key={d}
            onClick={() => onDay(d)}
            aria-pressed={d === day}
            className={cn(
              "flex min-h-12 min-w-12 flex-col items-center justify-center border text-xs",
              d === day ? "border-foreground bg-foreground text-background" : "border-line",
            )}
          >
            <span className="capitalize">{format(parseISO(d), "EEE", { locale: it })}</span>
            <span className="nums">{format(parseISO(d), "d")}</span>
          </button>
        ))}
      </div>
      <div className="mb-2 flex justify-between text-[0.625rem] text-muted nums">
        <span>10:00</span>
        <span>15:00</span>
        <span>20:00</span>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {working.map(({ person, list }) => (
          <li key={person.id} className={cn("py-3", person.id === me && "bg-surface")}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium">{person.displayName}</span>
              <span className="text-muted nums">{publishedDayText(list)}</span>
            </div>
            <div className="relative h-2 bg-surface" aria-hidden>
              {list.map((s) => {
                const start = Math.max(toMinutes(s.start_time!), TIMELINE_FROM);
                const end = Math.min(toMinutes(s.end_time!), TIMELINE_TO);
                if (end <= start) return null;
                return (
                  <span
                    key={s.id}
                    className={cn(
                      "absolute inset-y-0",
                      s.is_back_office ? "hatch text-foreground" : "bg-foreground",
                    )}
                    style={{
                      left: `${((start - TIMELINE_FROM) / span) * 100}%`,
                      width: `${((end - start) / span) * 100}%`,
                    }}
                  />
                );
              })}
            </div>
          </li>
        ))}
        {working.length === 0 ? (
          <li className="py-6 text-sm text-muted">Nessuno in turno.</li>
        ) : null}
      </ul>
      {away.length ? (
        <p className="mt-4 text-sm text-muted">
          Assenti: {away.map((p) => p.displayName).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
