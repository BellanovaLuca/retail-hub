"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  SpreadsheetGrid,
  type CellChange,
  type CellState,
  type GridColumn,
  type GridRow,
} from "@/components/spreadsheet";
import { Counter } from "@/components/targets/counter";
import { ProgressBar } from "@/components/targets/progress-bar";
import { SaveIndicator } from "@/components/targets/save-indicator";
import { entryKey, useEntryAutosave } from "@/components/targets/use-entry-autosave";
import { Button } from "@/components/ui/button";
import {
  buildPersonSheet,
  formatCount,
  isEditableDate,
  parseCount,
  remainingText,
  type SheetRow,
} from "@/lib/kpi/sheet";
import { cn } from "@/lib/utils";
import { saveMyEntries } from "./actions";

export type MyWeekProps = {
  days: string[];
  today: string;
  kpis: { kpiId: string; code: string; label: string }[];
  targets: Record<string, number>;
  comments: Record<string, string>;
  initialValues: Record<string, number | null>;
};

const DONE = "done";
const REMAINING = "remaining";
const TARGET = "target";

function dayLabel(date: string) {
  const d = parseISO(date);
  return {
    letter: format(d, "EEEEE", { locale: it }).toUpperCase(),
    number: format(d, "d"),
    long: format(d, "EEEE d MMMM", { locale: it }),
  };
}

export function MyWeek({ days, today, kpis, targets, comments, initialValues }: MyWeekProps) {
  const editable = React.useCallback((d: string) => isEditableDate(d, today), [today]);
  const defaultDay = days.includes(today)
    ? today
    : ([...days].reverse().find((d) => editable(d)) ?? days[days.length - 1]);
  const [selected, setSelected] = React.useState(defaultDay);
  const [message, setMessage] = React.useState<string | null>(null);

  const router = useRouter();
  // Dopo ogni salvataggio si ricarica la card "Negozio" (i valori della pagina restano quelli
  // ottimistici: l'hook ignora i nuovi valori iniziali).
  const { values, get, update, status, error } = useEntryAutosave(
    initialValues,
    async (changes) => {
      const res = await saveMyEntries(changes);
      if (res.ok) router.refresh();
      return res;
    },
  );

  const rows: SheetRow[] = React.useMemo(
    () =>
      buildPersonSheet({
        days,
        kpis,
        targets,
        comments,
        entries: Object.entries(values)
          .filter(([, v]) => v !== null)
          .map(([key, v]) => {
            const [kpiId, date] = key.split("|");
            return { kpiId, date, value: v as number };
          }),
      }),
    [days, kpis, targets, comments, values],
  );

  const filled = React.useMemo(
    () =>
      new Set(
        Object.entries(values)
          .filter(([, v]) => v !== null)
          .map(([key]) => key.split("|")[1]),
      ),
    [values],
  );

  const canEdit = editable(selected);
  const selectedLabel = selected === today ? "Oggi" : dayLabel(selected).long;
  const emptyToday = kpis.filter((k) => get(k.kpiId, selected) === null);

  /* ---------------------------------------------------------- desktop */

  const columns: GridColumn[] = React.useMemo(
    () => [
      ...days.map((d) => {
        const l = format(parseISO(d), "EEE", { locale: it });
        return {
          id: d,
          label: l.charAt(0).toUpperCase() + l.slice(1),
          sublabel: format(parseISO(d), "d MMM", { locale: it }),
          width: 64,
          highlight: d === today,
          shaded: !editable(d),
        };
      }),
      { id: DONE, label: "A quanto sei", width: 104 },
      { id: REMAINING, label: "Quanto mi manca?", width: 168 },
      { id: TARGET, label: "Obiettivo", width: 96 },
    ],
    [days, today, editable],
  );
  const gridRows: GridRow[] = React.useMemo(
    () => kpis.map((k) => ({ id: k.kpiId, label: k.label })),
    [kpis],
  );
  const rowById = React.useMemo(() => new Map(rows.map((r) => [r.kpiId, r])), [rows]);

  const getValue = React.useCallback(
    (kpiId: string, col: string) => {
      const row = rowById.get(kpiId);
      if (!row) return "";
      if (col === DONE) return formatCount(row.done);
      if (col === REMAINING) return remainingText(row);
      if (col === TARGET) return row.target === null ? "—" : formatCount(row.target);
      return formatCount(values[entryKey(kpiId, col)]);
    },
    [rowById, values],
  );

  const getCellState = React.useCallback(
    (kpiId: string, col: string): CellState | undefined => {
      if (col === DONE) return { readOnly: true, className: "font-medium bg-surface" };
      if (col === REMAINING) {
        const row = rowById.get(kpiId);
        return { readOnly: true, tone: row?.reached ? "success" : undefined };
      }
      if (col === TARGET) return { readOnly: true };
      if (!editable(col))
        return {
          readOnly: true,
          tone: "muted",
          title: col > today ? "Giorno futuro" : "Si può correggere fino a 7 giorni indietro",
        };
      return undefined;
    },
    [rowById, editable, today],
  );

  const onGridChange = React.useCallback(
    (changes: CellChange[]) => {
      const valid = [];
      for (const c of changes) {
        const v = parseCount(c.value);
        if (v === "invalid") continue;
        valid.push({ kpiId: c.rowId, date: c.colId, value: v });
      }
      update(valid);
    },
    [update],
  );

  const normalize = React.useCallback((value: string) => {
    const v = parseCount(value);
    return v === "invalid" ? { error: "Scrivi un numero (es. 3)." } : { value: formatCount(v) };
  }, []);

  return (
    <>
      {/* ------------------------------------------------ telefono: Oggi */}
      <section className="md:hidden" aria-label="Compila la giornata">
        <ol className="mb-6 grid grid-cols-7 gap-1" aria-label="Giorni della settimana">
          {days.map((d) => {
            const l = dayLabel(d);
            const active = d === selected;
            const disabled = !editable(d);
            return (
              <li key={d}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  aria-label={`${l.long}${filled.has(d) ? ", compilato" : ""}`}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md border text-xs nums transition-colors duration-150",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-line text-foreground",
                    d === today && !active && "border-t-[3px] border-t-foreground",
                    disabled && "border-transparent text-subtle",
                  )}
                >
                  <span className="text-[0.625rem] tracking-[0.08em]">{l.letter}</span>
                  <span className="text-sm">{l.number}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "size-1 rounded-full",
                      filled.has(d)
                        ? active
                          ? "bg-background"
                          : "bg-foreground"
                        : "bg-transparent",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl font-light first-letter:uppercase">
            {selectedLabel}
          </h2>
          <SaveIndicator status={status} error={error} />
        </div>
        {!canEdit ? (
          <p className="mb-4 text-sm text-muted">
            Questo giorno non si può più modificare (fino a 7 giorni indietro).
          </p>
        ) : null}

        <ul className="border-t border-line">
          {rows.map((row) => (
            <li key={row.kpiId} className="border-b border-line py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-base leading-tight font-medium">{row.label}</span>
                <Counter
                  label={row.label}
                  value={get(row.kpiId, selected)}
                  disabled={!canEdit}
                  onChange={(v) => update([{ kpiId: row.kpiId, date: selected, value: v }])}
                />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm nums">
                <div>
                  <dt className="eyebrow text-[0.625rem]">A quanto sei</dt>
                  <dd className="mt-0.5 font-medium">{formatCount(row.done)}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-[0.625rem]">Quanto mi manca?</dt>
                  <dd className={cn("mt-0.5", row.reached && "text-success")}>
                    {remainingText(row)}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-[0.625rem]">Obiettivo</dt>
                  <dd className="mt-0.5">{row.target === null ? "—" : formatCount(row.target)}</dd>
                </div>
              </dl>
              {row.target !== null ? (
                <ProgressBar
                  className="mt-3"
                  ratio={row.ratio}
                  label={`${row.label}: avanzamento`}
                />
              ) : null}
              {row.comment ? <VoiceComment text={row.comment} /> : null}
            </li>
          ))}
        </ul>

        {canEdit && emptyToday.length > 0 ? (
          <Button
            variant="ghost"
            className="mt-4 w-full text-muted"
            onClick={() =>
              update(emptyToday.map((k) => ({ kpiId: k.kpiId, date: selected, value: 0 })))
            }
          >
            Niente da segnare: metti 0 alle voci vuote
          </Button>
        ) : null}
      </section>

      {/* ------------------------------------------------ desktop: foglio */}
      <section className="hidden md:block" aria-label="Foglio della settimana">
        <SpreadsheetGrid
          ariaLabel="I miei numeri della settimana"
          rows={gridRows}
          columns={columns}
          getValue={getValue}
          getCellState={getCellState}
          normalize={normalize}
          onChange={(changes) => {
            setMessage(null);
            onGridChange(changes);
          }}
          rowHeaderLabel="Voce"
          saveState={status === "pending" ? "saving" : status === "idle" ? "idle" : status}
          density="comfortable"
          className="[--grid-max-height:none]"
        />
        {error || message ? <p className="mt-2 text-sm text-danger">{error ?? message}</p> : null}
        <p className="mt-3 text-xs text-muted">
          Scrivi direttamente nelle celle: si salva da solo. I giorni in grigio non si possono
          modificare (futuri o più vecchi di 7 giorni).
        </p>
        {rows.some((r) => r.comment) ? (
          <div className="mt-8">
            <h2 className="mb-3 eyebrow">Commenti sulle voci</h2>
            <dl className="divide-y divide-line border-y border-line">
              {rows
                .filter((r) => r.comment)
                .map((r) => (
                  <div key={r.kpiId} className="grid grid-cols-[12rem_1fr] gap-4 py-3 text-sm">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className="whitespace-pre-line">{r.comment}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ) : null}
      </section>
    </>
  );
}

function VoiceComment({ text }: { text: string }) {
  return (
    <p className="mt-3 flex gap-2 text-sm text-muted">
      <MessageSquareText className="mt-0.5 size-4 shrink-0 stroke-[1.5]" aria-hidden />
      <span className="whitespace-pre-line">{text}</span>
    </p>
  );
}
