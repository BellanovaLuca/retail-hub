"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PersonDot } from "@/components/ui/table";
import { formatInRome } from "@/lib/dates";
import { toggleResponsibilityCheck } from "@/lib/responsibilities/actions";
import { hasAnyAssignee, isoWeekdayOf, isScheduledOn } from "@/lib/responsibilities/assignment";
import { cn } from "@/lib/utils";
import { DayLettersInline } from "./day-letters";

export type MonitorPerson = { id: string; name: string; color: string | null };
export type MonitorColumn = {
  id: string;
  title: string;
  scheduleDays: number[];
  allStaff: boolean;
  /** Giorni (1–7) di ciascun assegnato nella settimana (vuoto per le attività «per tutti»). */
  personDays: Record<string, number[]>;
};
export type MonitorCheck = { doneById: string | null; doneByName: string | null; doneAt: string };
type Checks = Record<string, Record<string, MonitorCheck>>;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Controllo delle spunte: persone in riga, responsabilità in colonna, un giorno alla volta.
 * Per ogni persona si vede se l'attività che le toccava quel giorno è stata spuntata.
 * Un clic su una casella la segna (o toglie la spunta) a nome della persona.
 */
export function CheckMonitor({
  days,
  today,
  people,
  columns,
  checks: initialChecks,
  onShift,
}: {
  days: string[];
  today: string;
  people: MonitorPerson[];
  columns: MonitorColumn[];
  checks: Checks;
  /** Per giorno: chi è in turno, o null se i turni non sono pubblicati. */
  onShift: Record<string, string[] | null>;
}) {
  const router = useRouter();
  const [day, setDay] = React.useState(() =>
    days.includes(today) ? today : today > days[days.length - 1] ? days[days.length - 1] : days[0],
  );
  const [checks, setChecks] = React.useState(initialChecks);
  React.useEffect(() => setChecks(initialChecks), [initialChecks]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const scheduled = (c: MonitorColumn, d: string) => isScheduledOn(c.scheduleDays, d);
  /** La persona ha l'attività in quel giorno? */
  const isAssigned = (c: MonitorColumn, personId: string, d: string) =>
    c.allStaff || (c.personDays[personId]?.includes(isoWeekdayOf(d)) ?? false);
  const hasAssignees = (c: MonitorColumn) => hasAnyAssignee(c);
  /** Attività assegnate, previste in un giorno e non spuntate. */
  const missingOn = (d: string) =>
    columns.filter((c) => hasAssignees(c) && scheduled(c, d) && !checks[c.id]?.[d]);
  const unassigned = columns.filter((c) => !hasAssignees(c)).length;

  const shift = onShift[day] ?? null;
  const inShift = (personId: string) => shift === null || shift.includes(personId);
  const isFuture = day > today;
  const dayLong = cap(format(parseISO(day), "EEEE d MMMM", { locale: it }));

  function toggle(c: MonitorColumn, person: MonitorPerson) {
    const current = checks[c.id]?.[day];
    if (current && !confirm(`Togliere la spunta di «${c.title}» di ${dayLong.toLowerCase()}?`))
      return;
    setError(null);
    const before = checks;
    setChecks((prev) => {
      const row = { ...(prev[c.id] ?? {}) };
      if (current) delete row[day];
      else
        row[day] = {
          doneById: person.id,
          doneByName: person.name,
          doneAt: new Date().toISOString(),
        };
      return { ...prev, [c.id]: row };
    });
    startTransition(async () => {
      const res = await toggleResponsibilityCheck({
        responsibilityId: c.id,
        date: day,
        done: !current,
        onBehalfOf: person.id,
      });
      if (!res.ok) {
        setChecks(before);
        setError(`${c.title}: ${res.message}`);
        return;
      }
      router.refresh();
    });
  }

  if (columns.length === 0) {
    return (
      <p className="py-6 font-display text-xl font-light text-subtle">
        Nessuna responsabilità attiva.
      </p>
    );
  }

  const missingToday = missingOn(day);

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Giorno" className="grid grid-cols-7 gap-1 sm:max-w-2xl">
        {days.map((d) => {
          const date = parseISO(d);
          const active = d === day;
          const missing = d < today ? missingOn(d).length : 0;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setDay(d)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-xs nums transition-colors duration-150",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-line hover:border-foreground",
                d === today && !active && "border-t-[3px] border-t-foreground",
              )}
            >
              <span className="eyebrow text-[0.625rem] text-current">
                {format(date, "EEE", { locale: it })}
              </span>
              <span className="text-sm">{format(date, "d")}</span>
              <span
                className={cn(
                  "text-[0.625rem] leading-none",
                  missing ? (active ? "text-background" : "text-danger") : "text-transparent",
                )}
              >
                {missing ? `${missing} mancant${missing === 1 ? "e" : "i"}` : "·"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-sm nums" aria-live="polite">
        <span className="font-medium">{dayLong}</span>
        <span className="text-muted">
          {" · "}
          {isFuture
            ? "giorno futuro"
            : missingToday.length === 0
              ? "tutte le attività previste sono spuntate"
              : `${missingToday.length} ${missingToday.length === 1 ? "attività non ancora spuntata" : "attività non ancora spuntate"}`}
          {unassigned ? ` · ${unassigned} senza nessuno assegnato (assegnale qui sopra)` : ""}
          {shift === null && !isFuture ? " · turni del giorno non pubblicati" : ""}
        </span>
      </p>
      <p role={error ? "alert" : undefined} className="min-h-5 text-sm text-danger">
        {error}
      </p>

      <div className="relative overflow-x-auto rounded-md border border-line">
        <table className="w-max min-w-full border-collapse text-sm">
          <caption className="sr-only">Spunte delle responsabilità di {dayLong}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-40 border-b border-line bg-background px-3 py-2 text-left align-bottom eyebrow font-semibold"
              >
                Persona
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="w-28 min-w-28 border-b border-l border-line px-2 py-2 text-center align-bottom font-medium"
                >
                  <span className="line-clamp-3 leading-tight">{c.title}</span>
                  <DayLettersInline days={c.scheduleDays} className="mt-1.5" />
                  {c.allStaff ? (
                    <span className="mt-1 block text-[0.6875rem] font-normal text-subtle">
                      per tutti
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const present = inShift(p.id);
              return (
                <tr key={p.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-line bg-background px-3 py-1 text-left font-normal whitespace-nowrap"
                  >
                    <span className={cn("flex items-center gap-2", !present && "text-muted")}>
                      <PersonDot color={p.color} /> {p.name}
                    </span>
                    {!present ? (
                      <span className="block pl-4 text-[0.6875rem] text-subtle">non in turno</span>
                    ) : null}
                  </th>
                  {columns.map((c) => {
                    const assigned = isAssigned(c, p.id, day);
                    const check = checks[c.id]?.[day];
                    const mine = !!check && check.doneById === p.id;
                    const on = scheduled(c, day);
                    // Le attività «per tutti» mostrano la spunta solo nella riga di chi l'ha fatta.
                    const show = assigned && (!c.allStaff || mine || !check);
                    let state:
                      "none" | "off" | "done" | "doneOther" | "missed" | "pending" | "away";
                    if (!show) state = "none";
                    else if (check) state = mine ? "done" : "doneOther";
                    else if (!on) state = "off";
                    else if (!present) state = "away";
                    else if (c.allStaff) state = day < today ? "missed" : "pending";
                    else state = day < today ? "missed" : "pending";
                    const label =
                      state === "done"
                        ? `fatta da ${p.name} alle ${formatInRome(check!.doneAt, "HH:mm")}`
                        : state === "doneOther"
                          ? `fatta da ${check!.doneByName ?? "—"} alle ${formatInRome(check!.doneAt, "HH:mm")}`
                          : state === "missed"
                            ? "non svolta"
                            : state === "pending"
                              ? "da fare"
                              : state === "away"
                                ? "non in turno"
                                : state === "off"
                                  ? "non prevista in questo giorno"
                                  : "non assegnata";
                    const clickable =
                      !isFuture && state !== "none" && state !== "off" && (on || !!check);
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          "border-b border-l border-line p-1 text-center align-middle",
                          state === "none" && "bg-surface/40",
                        )}
                      >
                        {state === "none" ? (
                          <span className="sr-only">{label}</span>
                        ) : (
                          <button
                            type="button"
                            disabled={!clickable || pending}
                            onClick={() => toggle(c, p)}
                            aria-label={`${p.name} · ${c.title}: ${label}`}
                            title={cap(label)}
                            className={cn(
                              "mx-auto flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-sm border text-[0.6875rem] leading-tight",
                              state === "done" && "border-foreground bg-foreground text-background",
                              state === "doneOther" && "border-foreground text-foreground",
                              state === "missed" && "border-danger/50 bg-danger/10 text-danger",
                              state === "pending" && "border-line-strong text-muted",
                              (state === "away" || state === "off") &&
                                "border-dashed border-line text-subtle",
                              clickable && "hover:border-foreground",
                            )}
                          >
                            {state === "done" || state === "doneOther" ? (
                              <>
                                <Check className="size-4 stroke-2" aria-hidden />
                                <span className="nums">
                                  {state === "done"
                                    ? formatInRome(check!.doneAt, "HH:mm")
                                    : (check!.doneByName ?? "—")}
                                </span>
                              </>
                            ) : (
                              <span>
                                {state === "missed"
                                  ? "non svolta"
                                  : state === "pending"
                                    ? "da fare"
                                    : state === "away"
                                      ? "non in turno"
                                      : "—"}
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-background px-3 py-2 text-left eyebrow font-semibold"
              >
                Esito del giorno
              </th>
              {columns.map((c) => {
                const check = checks[c.id]?.[day];
                const on = scheduled(c, day);
                return (
                  <td
                    key={c.id}
                    className={cn(
                      "border-l border-line px-2 py-2 text-center text-xs",
                      check
                        ? "font-medium"
                        : !on
                          ? "text-subtle"
                          : !hasAssignees(c)
                            ? "text-warning"
                            : day < today
                              ? "text-danger"
                              : "text-muted",
                    )}
                  >
                    {check
                      ? `✓ ${check.doneByName ?? "—"}`
                      : !on
                        ? "non prevista"
                        : !hasAssignees(c)
                          ? "nessuno assegnato"
                          : day < today
                            ? "non svolta"
                            : "da fare"}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="max-w-3xl text-xs text-muted">
        Ogni casella è una responsabilità assegnata alla persona in questo giorno: nera con
        l&apos;ora = l&apos;ha spuntata lei; con il nome di un collega = l&apos;ha fatta
        l&apos;altro assegnato; rossa = non svolta a giornata finita. Le caselle vuote non sono
        assegnate in questo giorno. Con un clic segni tu l&apos;attività come fatta dalla persona, o
        togli la spunta.
      </p>
    </div>
  );
}
