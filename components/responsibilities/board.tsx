"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import {
  canToggleCheck,
  cellState,
  isScheduledOn,
  type CellState,
} from "@/lib/responsibilities/assignment";
import { toggleResponsibilityCheck } from "@/lib/responsibilities/actions";
import { cn } from "@/lib/utils";
import { dayHeader, dayLong, doneAtLabel } from "./format";

export type BoardPerson = { id: string; name: string };

export type BoardRow = {
  id: string;
  title: string;
  allStaff: boolean;
  scheduleDays: number[];
  owner: BoardPerson | null;
  supports: BoardPerson[];
  /** Chi la fa oggi, secondo i turni (solo se la settimana contiene oggi). */
  todayLabel: string | null;
  todayUncovered: boolean;
};

export type BoardCheck = { doneByName: string | null; doneAt: string };
type Checks = Record<string, Record<string, BoardCheck>>;
type Toggle = { id: string; date: string; check: BoardCheck | null };

const stateText: Record<CellState, string> = {
  done: "fatta",
  pending: "da fare",
  missed: "non svolta",
  off: "non prevista",
};

/**
 * Tabellone delle responsabilità come l'Excel: attività × lun–dom. Si spunta con un tocco
 * (aggiornamento ottimistico; se il server rifiuta, la casella torna com'era).
 */
export function ResponsibilityBoard({
  rows,
  days,
  today,
  checks,
  viewer,
  personHref,
  highlightPersonId,
}: {
  rows: BoardRow[];
  days: string[];
  today: string;
  checks: Checks;
  viewer: { id: string; name: string; isAdmin: boolean };
  /** Base del link sui nomi, es. "/comunicazioni/responsabilita?persona=". */
  personHref?: string;
  highlightPersonId?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(checks, (state: Checks, t: Toggle) => {
    const row = { ...(state[t.id] ?? {}) };
    if (t.check) row[t.date] = t.check;
    else delete row[t.date];
    return { ...state, [t.id]: row };
  });

  function toggle(row: BoardRow, date: string, done: boolean) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({
        id: row.id,
        date,
        check: done ? { doneByName: viewer.name, doneAt: new Date().toISOString() } : null,
      });
      const result = await toggleResponsibilityCheck({ responsibilityId: row.id, date, done });
      if (!result.ok) setError(`${row.title}: ${result.message}`);
    });
  }

  const name = (p: BoardPerson) =>
    personHref ? (
      <Link href={`${personHref}${p.id}`} className="underline-offset-4 hover:underline">
        {p.name}
      </Link>
    ) : (
      p.name
    );

  return (
    <div>
      <p
        aria-live="polite"
        role={error ? "alert" : undefined}
        className="min-h-5 text-sm text-danger"
      >
        {error}
      </p>
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[36rem] border-collapse text-sm sm:min-w-[44rem]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-36 min-w-36 border-b border-line bg-background py-2.5 pr-4 text-left eyebrow sm:w-[40%] sm:min-w-56"
              >
                Attività
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  aria-current={d === today ? "date" : undefined}
                  className={cn(
                    "border-b border-line px-1 py-2.5 text-center eyebrow font-semibold whitespace-nowrap",
                    d === today && "border-t-[3px] border-t-foreground text-foreground",
                  )}
                >
                  {dayHeader(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isAssignee =
                row.owner?.id === viewer.id || row.supports.some((s) => s.id === viewer.id);
              const highlighted =
                !!highlightPersonId &&
                (row.owner?.id === highlightPersonId ||
                  row.supports.some((s) => s.id === highlightPersonId));
              return (
                <tr key={row.id} className={cn(highlighted && "bg-surface")}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 border-b border-line py-3 pr-4 text-left align-top font-normal",
                      highlighted ? "bg-surface" : "bg-background",
                      highlighted && "pl-3 shadow-[inset_3px_0_0_var(--foreground)]",
                    )}
                  >
                    <span className="block font-medium">{row.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {row.allStaff ? (
                        <span className="font-semibold text-foreground">Tutti</span>
                      ) : (
                        <>
                          {row.owner ? (
                            <strong className="font-semibold text-foreground">
                              {name(row.owner)}
                            </strong>
                          ) : (
                            <span className="text-warning">Senza responsabile</span>
                          )}
                          {row.supports.length > 0 ? (
                            <>
                              {" · "}
                              {row.supports.map((s, i) => (
                                <span key={s.id}>
                                  {i > 0 ? ", " : ""}
                                  {name(s)}
                                </span>
                              ))}
                            </>
                          ) : null}
                        </>
                      )}
                    </span>
                    {row.todayLabel ? (
                      <span
                        className={cn(
                          "mt-1 block text-xs",
                          row.todayUncovered ? "text-danger" : "text-muted",
                        )}
                      >
                        Oggi: {row.todayLabel}
                      </span>
                    ) : null}
                  </th>
                  {days.map((date) => {
                    const check = optimistic[row.id]?.[date];
                    const scheduled = isScheduledOn(row.scheduleDays, date);
                    const state = cellState({ scheduled, checked: !!check, date, today });
                    // Giorno non previsto: non cliccabile (salvo togliere una spunta già messa).
                    const clickable =
                      (scheduled || !!check) &&
                      date <= today &&
                      canToggleCheck({
                        isAdmin: viewer.isAdmin,
                        isAssignee,
                        allStaff: row.allStaff,
                        date,
                        today,
                      });
                    const tooltip =
                      state === "done"
                        ? `Fatta da ${check?.doneByName ?? "—"} · ${doneAtLabel(check!.doneAt)}`
                        : state === "off"
                          ? "Non prevista"
                          : state === "missed"
                            ? "Non svolta"
                            : date > today
                              ? "Prevista"
                              : "Da fare";
                    const label = `${row.title}, ${dayLong(date)}: ${stateText[state]}${
                      state === "done" ? `, ${tooltip.toLowerCase()}` : ""
                    }`;
                    const box = cn(
                      "mx-auto grid h-10 w-full max-w-14 place-items-center rounded-sm transition-colors duration-150",
                      state === "done" && "bg-foreground text-background",
                      state === "pending" && "border border-foreground",
                      state === "missed" && "border border-danger/30 bg-danger/10",
                      state === "off" && "bg-line/70",
                    );
                    return (
                      <td
                        key={date}
                        className={cn(
                          "border-b border-line px-1 py-2 text-center",
                          date === today && "bg-surface/40",
                        )}
                      >
                        {clickable ? (
                          <button
                            type="button"
                            title={`${tooltip}${state === "done" ? " · tocca per annullare" : " · tocca per spuntare"}`}
                            aria-label={label}
                            aria-pressed={state === "done"}
                            onClick={() => toggle(row, date, state !== "done")}
                            className={cn(box, "cursor-pointer hover:opacity-80")}
                          >
                            {state === "done" ? (
                              <Check className="size-4 stroke-2" aria-hidden />
                            ) : null}
                          </button>
                        ) : (
                          <span role="img" title={tooltip} aria-label={label} className={box}>
                            {state === "done" ? (
                              <Check className="size-4 stroke-2" aria-hidden />
                            ) : null}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Legenda">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3.5 rounded-sm bg-foreground" /> Fatta
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3.5 rounded-sm border border-foreground" /> Da fare
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3.5 rounded-sm border border-danger/30 bg-danger/10" />{" "}
          Non svolta
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3.5 rounded-sm bg-line/70" /> Non prevista
        </li>
      </ul>
    </div>
  );
}
