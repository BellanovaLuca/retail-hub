"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import Link from "next/link";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { STATUS_LABELS, type RequestStatus } from "@/lib/requests";
import { visibleCount, type CalendarTone } from "@/lib/requests/calendar";
import { cn } from "@/lib/utils";

export type CalendarEntry = {
  id: string;
  person: string;
  /** "Ferie", "Scambio con un collega"… */
  typeLabel: string;
  /** Periodo e dettagli ("14–16 dic · ogni lun, mer"). */
  detail: string;
  status: RequestStatus;
  tone: CalendarTone;
};

export type CalendarDay = { date: string; inMonth: boolean; ids: string[] };

/** In attesa = tratteggio ambra · approvata = pieno verde · rifiutata/annullata = barrato tenue. */
const TONE_CLASS: Record<CalendarTone, string> = {
  pending: "border-dashed border-warning text-warning",
  approved: "border-success/40 bg-success/8 text-success",
  closed: "border-transparent text-subtle line-through",
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const longDay = (date: string) => format(parseISO(date), "EEEE d MMMM", { locale: it });

/** Una richiesta nella casella del giorno: nome · tipo, con lo stato nel disegno e nell'etichetta. */
function Chip({ entry, className }: { entry: CalendarEntry; className?: string }) {
  const label = `${entry.person} · ${entry.typeLabel} · ${entry.detail} · ${STATUS_LABELS[entry.status]}`;
  return (
    <Link
      href={`/admin/richieste/${entry.id}`}
      title={label}
      aria-label={label}
      data-tone={entry.tone}
      className={cn(
        "block truncate rounded-sm border px-1.5 py-0.5 text-xs leading-tight hover:border-foreground hover:text-foreground",
        TONE_CLASS[entry.tone],
        className,
      )}
    >
      <span className="font-medium">{entry.person}</span> · {entry.typeLabel}
    </Link>
  );
}

/** Riga dell'elenco del giorno (telefono e finestra «+N altre»): più spazio, stato per esteso. */
function Row({ entry }: { entry: CalendarEntry }) {
  return (
    <Link
      href={`/admin/richieste/${entry.id}`}
      data-tone={entry.tone}
      className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-surface"
    >
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-medium",
            entry.tone === "closed" && "font-normal text-subtle line-through",
          )}
        >
          {entry.person} · {entry.typeLabel}
        </span>
        <span className="block truncate text-xs text-muted nums">{entry.detail}</span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-sm border px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.06em] uppercase",
          entry.tone === "pending" && "border-dashed border-warning text-warning",
          entry.tone === "approved" && "border-success/40 bg-success/8 text-success",
          entry.tone === "closed" && "border-line text-subtle",
        )}
      >
        {STATUS_LABELS[entry.status]}
      </span>
    </Link>
  );
}

/**
 * Calendario del mese delle richieste (lun→dom). Su schermo largo la griglia: in ogni giorno le
 * prime richieste e «+N altre» che apre l'elenco del giorno. Su telefono un elenco per giorno.
 */
export function RequestsCalendar({
  days,
  entries,
  today,
}: {
  days: CalendarDay[];
  entries: Record<string, CalendarEntry>;
  today: string;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const list = (day: CalendarDay) => day.ids.map((id) => entries[id]).filter(Boolean);
  const monthDays = days.filter((d) => d.inMonth);
  const busyDays = monthDays.filter((d) => d.ids.length > 0);
  const opened = days.find((d) => d.date === openDay);

  return (
    <div>
      {/* Schermo largo: griglia del mese. */}
      <div className="hidden md:block" data-testid="calendar-grid">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center eyebrow">
              {d}
            </div>
          ))}
        </div>
        <ol className="grid grid-cols-7">
          {days.map((day) => {
            const all = list(day);
            const { shown, hidden } = visibleCount(all.length);
            return (
              <li
                key={day.date}
                data-date={day.date}
                aria-current={day.date === today ? "date" : undefined}
                aria-label={`${longDay(day.date)}: ${all.length === 0 ? "nessuna richiesta" : all.length === 1 ? "1 richiesta" : `${all.length} richieste`}`}
                className={cn(
                  "flex min-h-28 min-w-0 flex-col gap-1 border-r border-b border-line p-1.5 [&:nth-child(7n+1)]:border-l",
                  !day.inMonth && "bg-surface/60",
                  day.date === today && "border-t-[3px] border-t-foreground",
                )}
              >
                <span className={cn("text-xs nums", day.inMonth ? "text-muted" : "text-subtle")}>
                  {Number(day.date.slice(8, 10))}
                </span>
                {all.slice(0, shown).map((entry) => (
                  <Chip key={entry.id} entry={entry} className={cn(!day.inMonth && "opacity-60")} />
                ))}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenDay(day.date)}
                    className="rounded-sm px-1.5 py-0.5 text-left text-xs text-muted underline-offset-2 hover:bg-surface hover:text-foreground hover:underline"
                  >
                    +{hidden} altre
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Telefono: un elenco per giorno, solo i giorni con richieste. */}
      <div className="md:hidden" data-testid="calendar-list">
        {busyDays.length === 0 ? (
          <p className="py-12 font-display text-xl font-light text-subtle">
            Nessuna richiesta in questo mese.
          </p>
        ) : (
          <ol className="border-t border-line">
            {busyDays.map((day) => (
              <li
                key={day.date}
                data-date={day.date}
                className={cn(
                  "border-b border-line py-3",
                  day.date === today && "border-l-[3px] border-l-foreground pl-3",
                )}
              >
                <h3 className="eyebrow">
                  {longDay(day.date)}
                  {day.date === today ? " · oggi" : ""}
                </h3>
                <ul className="mt-1 divide-y divide-line/60">
                  {list(day).map((entry) => (
                    <li key={entry.id}>
                      <Row entry={entry} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Legenda. */}
      <ul
        aria-label="Legenda"
        className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted"
      >
        <li className="flex items-center gap-2">
          <span className={cn("rounded-sm border px-1.5 py-0.5", TONE_CLASS.pending)}>Nome</span>
          In attesa
        </li>
        <li className="flex items-center gap-2">
          <span className={cn("rounded-sm border px-1.5 py-0.5", TONE_CLASS.approved)}>Nome</span>
          Approvata
        </li>
        <li className="flex items-center gap-2">
          <span className={cn("rounded-sm border px-1.5 py-0.5", TONE_CLASS.closed)}>Nome</span>
          Rifiutata o annullata
        </li>
        <li className="text-subtle">
          Scambi: nel giorno dei turni scambiati. Indisponibilità: solo nei giorni indicati.
        </li>
      </ul>

      <Dialog open={Boolean(opened)} onOpenChange={(o) => !o && setOpenDay(null)}>
        {opened ? (
          <DialogContent
            title={longDay(opened.date).replace(/^./, (c) => c.toUpperCase())}
            description={`${opened.ids.length} richieste in questo giorno`}
          >
            <ul className="divide-y divide-line border-y border-line">
              {list(opened).map((entry) => (
                <li key={entry.id}>
                  <Row entry={entry} />
                </li>
              ))}
            </ul>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
