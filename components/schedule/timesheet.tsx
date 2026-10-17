"use client";

/**
 * Modalità "Foglio orario" del foglio turni (§8.1), come i fogli Week 39/40: un blocco per giorno,
 * colonne persone per area (Vista, Sole, Jolly), mezze celle da 30' da "dipingere".
 * Usa gli stessi dati dell'editor persone × giorni; ogni giornata dipinta si salva con `onSaveDay`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { weekdayOf } from "@/lib/domain/time";
import type { DepartmentRef, ShiftInput, Zone } from "@/lib/domain/types";
import {
  leaveFill,
  openingFor,
  shiftsFromMarks,
  timesheetGroups,
  toPersonInput,
  toShiftInputs,
  type TimesheetCalendar,
} from "@/lib/export/timesheet-model";
import { formatHours, residualHoursByDay, totalContractHours } from "@/lib/hours";
import type { LeaveRecord, SchedulePerson, ShiftRecord } from "@/lib/schedule/types";
import { isFullDayLeave, leaveLabelAdmin } from "@/lib/schedule/view";
import { markedSlotsToSegments, type SlotMark } from "@/lib/shifts/slots";
import { cn } from "@/lib/utils";
import {
  tableWidth,
  TimesheetColGroup,
  TimesheetDay,
  type Brush,
  type DayData,
  type DayLeave,
  type TimesheetColumn,
} from "./timesheet-day";

/** Stessa forma dell'input della Server Action `saveShiftDay`. */
export type TimesheetSaveInput = {
  weekId: string;
  profileId: string;
  date: string;
  templateId: string | null;
  segments: { start: string; end: string; isBackOffice: boolean | null }[];
  breakMinutes: number;
  departmentId: string | null;
  zone: Zone | null;
  note: string | null;
};

export type TimesheetProps = {
  weekId: string;
  weekNumber: number;
  days: string[];
  today: string;
  shifts: ShiftRecord[];
  leaves: LeaveRecord[];
  /** Richieste di assenza in attesa (solo admin): colonna in verde tratteggiato. */
  pendingRequests?: { profileId: string; date: string }[];
  people: SchedulePerson[];
  departments: DepartmentRef[];
  calendar: TimesheetCalendar;
  readOnly?: boolean;
  onSaveDay?: (input: TimesheetSaveInput) => Promise<{ ok: boolean; message?: string }>;
  /** Messaggio della regola violata nella mezz'ora che inizia a `start` ("HH:mm"). */
  violationsByDaySlot?: (date: string, start: string) => string | undefined;
};

const MAX_SEGMENTS = 4;
const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const k = (profileId: string, date: string) => `${profileId}|${date}`;

type Override = { marks: SlotMark[]; zone: Zone | null };

/** Riusa l'oggetto precedente se la firma non cambia: i giorni non toccati non si rirenderizzano. */
function useStableDays(make: () => { sig: string; value: DayData }[], deps: unknown[]) {
  const cache = useRef(new Map<string, { sig: string; value: DayData }>());
  return useMemo(() => {
    const out = make().map((entry) => {
      const prev = cache.current.get(entry.value.date);
      if (prev && prev.sig === entry.sig) return prev.value;
      cache.current.set(entry.value.date, entry);
      return entry.value;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function Timesheet({
  weekId,
  weekNumber,
  days,
  today,
  shifts,
  leaves,
  pendingRequests,
  people,
  departments,
  calendar,
  readOnly = false,
  onSaveDay,
  violationsByDaySlot,
}: TimesheetProps) {
  const [brush, setBrush] = useState<Brush>("sale");
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [zonePrompt, setZonePrompt] = useState<{
    profileId: string;
    date: string;
    marks: SlotMark[];
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const editable = !readOnly && Boolean(onSaveDay);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const groups = useMemo(() => timesheetGroups(people), [people]);
  const columns: TimesheetColumn[] = useMemo(
    () =>
      groups.flatMap((g) =>
        g.people.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          shortLabel: p.shortLabel,
          zone: g.zone,
        })),
      ),
    [groups],
  );
  const personInputs = useMemo(() => people.map(toPersonInput), [people]);

  /** Turni salvati per giornata (persona|data). */
  const recordsByKey = useMemo(() => {
    const map = new Map<string, ShiftRecord[]>();
    for (const s of shifts)
      map.set(k(s.profileId, s.date), [...(map.get(k(s.profileId, s.date)) ?? []), s]);
    for (const list of map.values())
      list.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
    return map;
  }, [shifts]);
  const baseInputs = useMemo(() => toShiftInputs(shifts, peopleById), [shifts, peopleById]);

  // Le modifiche ottimistiche restano finché il server non restituisce i dati aggiornati.
  const inflight = useRef(new Map<string, number>());
  const lastShifts = useRef(shifts);
  useEffect(() => {
    if (lastShifts.current === shifts) return;
    lastShifts.current = shifts;
    setOverrides((prev) => {
      const next = new Map([...prev].filter(([key]) => (inflight.current.get(key) ?? 0) > 0));
      return next.size === prev.size ? prev : next;
    });
  }, [shifts]);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  /** Base comune per i turni ricostruiti dalle mezze celle (reparto, pausa). */
  const metaFor = useCallback(
    (profileId: string, date: string) => {
      const records = recordsByKey.get(k(profileId, date)) ?? [];
      const timed = records.filter((r) => r.start && r.end);
      const first = timed[0] ?? records[0];
      return {
        first,
        departmentId: first?.departmentId ?? null,
        note: first?.note ?? null,
        zone: (records.find((r) => r.zone)?.zone ?? null) as Zone | null,
        breakMinutes: timed.length === 1 ? timed[0].breakMinutes : 0,
      };
    },
    [recordsByKey],
  );

  /** Turni effettivi: salvati, sostituiti dalle giornate ridipinte in attesa di conferma. */
  const effectiveInputs = useMemo(() => {
    if (overrides.size === 0) return baseInputs;
    const out: ShiftInput[] = baseInputs.filter((s) => !overrides.has(k(s.profileId, s.date)));
    for (const [key, o] of overrides) {
      const [profileId, date] = key.split("|");
      const meta = metaFor(profileId, date);
      const person = peopleById.get(profileId);
      out.push(
        ...shiftsFromMarks(o.marks, {
          profileId,
          date,
          zone: o.zone ?? (person && person.homeZone !== "jolly" ? person.homeZone : null),
          departmentId: meta.departmentId,
          breakMinutes: meta.breakMinutes,
        }),
      );
    }
    return out;
  }, [baseInputs, overrides, metaFor, peopleById]);

  const leaveByKey = useMemo(
    () => new Map(leaves.filter(isFullDayLeave).map((l) => [k(l.profileId, l.date), l])),
    [leaves],
  );
  const pendingSet = useMemo(
    () => new Set((pendingRequests ?? []).map((p) => k(p.profileId, p.date))),
    [pendingRequests],
  );

  const dayData = useStableDays(() => {
    const residuals = columns.map((c) =>
      residualHoursByDay(
        peopleById.get(c.id)?.weeklyHours ?? null,
        effectiveInputs.filter((s) => s.profileId === c.id),
        days,
      ),
    );
    return days.map((date, d) => {
      const holiday = calendar.holidays.find((h) => h.date === date) ?? null;
      const leavesOfDay: DayLeave[] = columns.map((c) => {
        const leave = leaveByKey.get(k(c.id, date));
        if (leave) {
          return {
            fill: leaveFill(leave),
            label: `${leaveLabelAdmin(leave)}${leave.source === "request" ? " · richiesta approvata" : ""}`,
            locked: true,
          };
        }
        if (pendingSet.has(k(c.id, date)))
          return { fill: "pending", label: "Richiesta in attesa", locked: false };
        return null;
      });
      const value: DayData = {
        date,
        label: `${WEEKDAYS[weekdayOf(date) - 1]} ${Number(date.slice(8, 10))}`,
        closed: Boolean(holiday?.storeClosed),
        holidayLabel: holiday?.label ?? null,
        opening: openingFor(date, calendar),
        inputs: effectiveInputs.filter((s) => s.date === date),
        residual: residuals.map((r) => r[d]?.before ?? null),
        leaves: leavesOfDay,
      };
      const { inputs, ...rest } = value;
      const sig = JSON.stringify([
        rest,
        inputs.map((s) => [
          s.profileId,
          s.start,
          s.end,
          s.backOffice,
          s.zone,
          s.breakMinutes,
          s.departmentId,
        ]),
        columns.map((c) => c.id),
      ]);
      return { sig, value };
    });
  }, [columns, peopleById, effectiveInputs, days, calendar, leaveByKey, pendingSet]);

  // --- Salvataggio ----------------------------------------------------------------------------

  const chains = useRef(new Map<string, Promise<unknown>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveRef = useRef(onSaveDay);
  saveRef.current = onSaveDay;

  const dropOverride = useCallback((key: string) => {
    setOverrides((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const runSave = useCallback(
    (profileId: string, date: string) => {
      const key = k(profileId, date);
      const save = saveRef.current;
      if (!save) return;
      inflight.current.set(key, (inflight.current.get(key) ?? 0) + 1);
      setSaving((n) => n + 1);
      const previous = chains.current.get(key) ?? Promise.resolve();
      const job = previous.then(async () => {
        // Si salva l'ultimo stato dipinto, anche se nel frattempo è cambiato.
        const o = overridesRef.current.get(key);
        if (!o) return;
        const person = peopleById.get(profileId);
        const meta = metaFor(profileId, date);
        const defaultBo = person ? !person.countsForCoverage : false;
        const segments = markedSlotsToSegments(o.marks).map((s) => ({
          start: s.start,
          end: s.end,
          // null = valore predefinito del profilo: lo si scrive solo se diverso.
          isBackOffice: s.backOffice === defaultBo ? null : s.backOffice,
        }));
        try {
          const res = await save({
            weekId,
            profileId,
            date,
            templateId: null,
            segments,
            breakMinutes: segments.length === 1 ? meta.breakMinutes : 0,
            departmentId: meta.departmentId,
            zone: o.zone ?? meta.zone,
            note: meta.note,
          });
          if (!res.ok) {
            setMessage(res.message ?? "Turno non salvato.");
            dropOverride(key);
          } else setMessage(null);
        } catch {
          setMessage("Turno non salvato: controlla la connessione e riprova.");
          dropOverride(key);
        }
      });
      chains.current.set(key, job);
      void job.finally(() => {
        inflight.current.set(key, (inflight.current.get(key) ?? 1) - 1);
        setSaving((n) => n - 1);
      });
    },
    [weekId, peopleById, metaFor, dropOverride],
  );

  const applyAndSave = useCallback(
    (profileId: string, date: string, marks: SlotMark[], zone: Zone | null, debounceMs: number) => {
      const key = k(profileId, date);
      if (markedSlotsToSegments(marks).length > MAX_SEGMENTS) {
        setMessage(`Al massimo ${MAX_SEGMENTS} fasce per giornata: riempi qualche vuoto.`);
        return;
      }
      setOverrides((prev) => new Map(prev).set(key, { marks, zone }));
      overridesRef.current = new Map(overridesRef.current).set(key, { marks, zone });
      const pending = timers.current.get(key);
      if (pending) clearTimeout(pending);
      if (debounceMs > 0) {
        timers.current.set(
          key,
          setTimeout(() => {
            timers.current.delete(key);
            runSave(profileId, date);
          }, debounceMs),
        );
      } else {
        timers.current.delete(key);
        runSave(profileId, date);
      }
    },
    [runSave],
  );

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => clearTimeout(id));
  }, []);

  const onCommit = useCallback(
    (profileId: string, date: string, marks: SlotMark[], debounceMs: number) => {
      if (!editable) return;
      const person = peopleById.get(profileId);
      const key = k(profileId, date);
      const zone = overridesRef.current.get(key)?.zone ?? metaFor(profileId, date).zone;
      // Per i jolly la prima pittura della giornata chiede l'area.
      if (person?.homeZone === "jolly" && !zone && marks.some(Boolean)) {
        setOverrides((prev) => new Map(prev).set(key, { marks, zone: null }));
        setZonePrompt({ profileId, date, marks });
        return;
      }
      applyAndSave(profileId, date, marks, zone, debounceMs);
    },
    [editable, peopleById, metaFor, applyAndSave],
  );

  const chooseZone = (zone: Zone | null) => {
    const prompt = zonePrompt;
    setZonePrompt(null);
    if (!prompt) return;
    if (!zone) {
      dropOverride(k(prompt.profileId, prompt.date));
      return;
    }
    applyAndSave(prompt.profileId, prompt.date, prompt.marks, zone, 0);
  };

  const toggleBrush = useCallback(() => setBrush((b) => (b === "sale" ? "bo" : "sale")), []);

  const contractTotal = totalContractHours(people);
  const width = tableWidth(columns.length);
  const promptPerson = zonePrompt ? peopleById.get(zonePrompt.profileId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {editable ? (
            <div role="radiogroup" aria-label="Pennello" className="flex border border-foreground">
              {(
                [
                  ["sale", "Vendita"],
                  ["bo", "Back office"],
                ] as const
              ).map(([value, label], i) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={brush === value}
                  onClick={() => setBrush(value)}
                  className={cn(
                    "flex min-h-9 items-center gap-2 px-3 text-sm",
                    i > 0 && "border-l border-foreground",
                    brush === value && "bg-foreground text-background",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block size-3 border border-current",
                      value === "sale" ? "bg-current" : "hatch",
                    )}
                  />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted" aria-live="polite">
            {saving > 0
              ? "Salvataggio…"
              : editable
                ? "Clic e trascina per dipingere la presenza"
                : ""}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <Legend className="bg-foreground">Vendita</Legend>
          <Legend className="hatch text-foreground">Back office</Legend>
          <Legend className="bg-danger/10">Ferie</Legend>
          <Legend className="bg-success/10">Richiesta approvata</Legend>
          {pendingRequests ? (
            <Legend className="border-dashed border-success bg-success/5">In attesa</Legend>
          ) : null}
          <Legend className="bg-line/60">Altre assenze</Legend>
          <Legend className="bg-surface">Fuori orario</Legend>
        </ul>
      </div>

      {message ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-sm text-danger">
          {message}
        </p>
      ) : null}

      <div className="overflow-x-auto border-y border-line">
        <table
          className="table-fixed border-collapse text-sm"
          style={{ width }}
          aria-label={`Foglio orario della week ${weekNumber}`}
        >
          <TimesheetColGroup count={columns.length} />
          <thead>
            <tr>
              <th
                colSpan={2}
                rowSpan={2}
                scope="col"
                className="py-2 text-left align-bottom font-display text-4xl font-light nums"
              >
                {weekNumber}
              </th>
              {groups.map((g) => (
                <th
                  key={g.zone}
                  colSpan={g.people.length}
                  scope="colgroup"
                  className={cn(
                    "border-l border-line py-1 text-center eyebrow",
                    g.zone === "vista"
                      ? "bg-vista/10"
                      : g.zone === "sole"
                        ? "bg-sole/10"
                        : "bg-surface",
                  )}
                >
                  {g.label}
                </th>
              ))}
              <th
                colSpan={5}
                rowSpan={2}
                scope="col"
                className="border-l border-line px-2 text-right align-bottom text-xs text-muted"
              >
                Contratto
                <span className="block font-display text-xl font-light text-foreground nums">
                  {formatHours(contractTotal)} h
                </span>
              </th>
            </tr>
            <tr>
              {columns.map((c) => {
                const h = peopleById.get(c.id)?.weeklyHours;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className="border-l border-line pb-1 text-center text-[0.625rem] font-normal text-muted nums"
                    title={`${c.displayName}: ore di contratto`}
                  >
                    {h == null ? "—" : formatHours(h)}
                  </th>
                );
              })}
            </tr>
          </thead>
          {dayData.map((day, i) => (
            <TimesheetDay
              key={day.date}
              day={day}
              columns={columns}
              people={personInputs}
              departments={departments}
              isToday={day.date === today}
              prevDate={days[i - 1] ?? null}
              nextDate={days[i + 1] ?? null}
              readOnly={!editable}
              brush={brush}
              onToggleBrush={toggleBrush}
              onCommit={onCommit}
              violationsByDaySlot={violationsByDaySlot}
            />
          ))}
        </table>
      </div>

      {editable ? (
        <p className="text-xs text-muted">
          Tastiera: frecce per muoversi, <kbd className="nums">1</kbd> ora piena, <kbd>.</kbd> o{" "}
          <kbd className="nums">5</kbd> mezz&apos;ora, <kbd>Canc</kbd> svuota l&apos;ora,{" "}
          <kbd>B</kbd> alterna back office. I vuoti in mezzo al turno diventano la pausa.
        </p>
      ) : null}

      <Dialog open={Boolean(zonePrompt)} onOpenChange={(open) => (open ? null : chooseZone(null))}>
        {zonePrompt ? (
          <DialogContent
            title="In quale area?"
            description={`${promptPerson?.displayName ?? "La persona"} è jolly: scegli l'area del turno di ${
              WEEKDAYS[weekdayOf(zonePrompt.date) - 1]
            } ${Number(zonePrompt.date.slice(8, 10))}. Si può cambiare dal dettaglio della giornata.`}
          >
            <div className="flex gap-3">
              <Button className="flex-1" variant="secondary" onClick={() => chooseZone("vista")}>
                <span aria-hidden className="size-2 rounded-full bg-vista" /> Vista
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => chooseZone("sole")}>
                <span aria-hidden className="size-2 rounded-full bg-sole" /> Sole
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn("inline-block size-3 border border-line-strong", className)}
      />
      {children}
    </li>
  );
}
