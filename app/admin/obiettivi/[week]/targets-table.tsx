"use client";

import { Maximize2, X } from "lucide-react";
import * as React from "react";
import { PersonDot } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type TargetsRow = {
  profileId: string;
  name: string;
  color: string | null;
  /** "Jolly", "Nessun turno", "Solo back office"… */
  sublabel?: string;
  hours: string;
};

export type TargetsColumn = {
  kpiId: string;
  label: string;
  strong?: boolean;
  /** Voce dell'altra area (obiettivo misto). */
  mixed?: boolean;
};

/** Sposta il cursore nel campo della stessa colonna, una riga sopra o sotto. */
function focusCell(table: string, row: number, col: string) {
  const el = document.querySelector<HTMLInputElement>(
    `[data-target-cell="${table}:${row}:${col}"]`,
  );
  if (el) {
    el.focus();
    el.select();
  }
}

function NumberCell({
  text,
  label,
  table,
  row,
  col,
  disabled,
  onCommit,
}: {
  /** Valore salvato o scritto (vuoto = nessun obiettivo). */
  text: string;
  label: string;
  table: string;
  row: number;
  col: string;
  disabled: boolean;
  /** Restituisce false se il testo non è un numero valido. */
  onCommit: (text: string) => boolean;
}) {
  // Mentre si scrive vale il testo digitato; fuori dal campo, il valore della tabella.
  const [draft, setDraft] = React.useState<string | null>(null);
  const [bad, setBad] = React.useState(false);

  const commit = () => {
    if (draft === null) return true;
    if (draft.trim() === text) {
      setDraft(null);
      setBad(false);
      return true;
    }
    const ok = onCommit(draft);
    setBad(!ok);
    if (ok) setDraft(null);
    return ok;
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-target-cell={`${table}:${row}:${col}`}
      aria-label={label}
      aria-invalid={bad || undefined}
      title={bad ? "Scrivi un numero (es. 12)." : undefined}
      disabled={disabled}
      value={draft ?? text}
      onFocus={(e) => {
        setDraft(text);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        setBad(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          if (commit()) focusCell(table, row + 1, col);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (commit()) focusCell(table, row - 1, col);
        } else if (e.key === "Escape") {
          setDraft(null);
          setBad(false);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-11 w-full min-w-0 border-0 bg-transparent px-1 text-center text-sm nums outline-none",
        "focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--foreground)]",
        bad && "bg-danger/10 text-danger shadow-[inset_0_0_0_2px_var(--danger)]",
      )}
    />
  );
}

/**
 * Tabella degli obiettivi di un'area (Vista o Sole), impostata come la griglia delle
 * responsabilità: le persone in riga, le voci in colonna, un campo da scrivere in ogni incrocio.
 * Tab passa al campo a destra, Invio (o le frecce) a quello sotto. Svuotare un campo toglie
 * l'obiettivo.
 */
export function TargetsTable({
  tableId,
  rows,
  columns,
  getText,
  comments,
  changedComments,
  totals,
  storeTargets,
  disabled,
  onCell,
  onComment,
  onExpandComment,
  onRemoveColumn,
  ariaLabel,
}: {
  /** Identifica la tabella nella pagina (per muoversi tra i campi con la tastiera). */
  tableId: string;
  rows: TargetsRow[];
  columns: TargetsColumn[];
  getText: (profileId: string, kpiId: string) => string;
  comments: Record<string, string>;
  /** Persone con il commento modificato e non ancora confermato. */
  changedComments: Set<string>;
  /** Somma assegnata per voce e ore pianificate totali. */
  totals: { hours: string; byKpi: Record<string, string> };
  /** Obiettivi del negozio per voce (se inseriti nella produttività oraria). */
  storeTargets: Record<string, string> | null;
  disabled: boolean;
  onCell: (profileId: string, kpiId: string, text: string) => boolean;
  onComment: (profileId: string, text: string) => void;
  onExpandComment: (profileId: string) => void;
  onRemoveColumn: (column: TargetsColumn) => void;
  ariaLabel: string;
}) {
  const th = "border-b border-l border-line px-2 py-2 text-center align-bottom text-sm font-medium";

  return (
    <div className="relative overflow-x-auto rounded-md border border-line">
      <table className="w-max min-w-full border-collapse text-sm">
        <caption className="sr-only">{ariaLabel}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-44 border-b border-line bg-background px-3 py-2 text-left align-bottom eyebrow font-semibold"
            >
              Persona
            </th>
            <th scope="col" className={cn(th, "w-56 min-w-56 text-left")}>
              Commento
              <span className="block text-[0.6875rem] font-normal text-subtle">
                lo vede in cima alla sua pagina
              </span>
            </th>
            <th scope="col" className={cn(th, "w-16 min-w-16")}>
              Ore
              <span className="block text-[0.6875rem] font-normal text-subtle">dai turni</span>
            </th>
            {columns.map((c) => (
              <th
                key={c.kpiId}
                id={`${tableId}-col-${c.kpiId}`}
                scope="col"
                className={cn(th, "w-24 min-w-24", c.mixed && "bg-surface")}
              >
                <span
                  className={cn(
                    "line-clamp-3 leading-tight",
                    c.strong && "font-semibold",
                    c.mixed && "font-normal text-muted",
                  )}
                >
                  {c.label}
                </span>
                {c.mixed ? (
                  <span className="mt-0.5 block text-[0.625rem] font-normal text-subtle">
                    altra area
                  </span>
                ) : null}
                <span className="mt-1 flex justify-center">
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-danger disabled:opacity-40"
                    aria-label={`Togli la colonna «${c.label}»`}
                    title="Togli questa colonna"
                    disabled={disabled}
                    onClick={() => onRemoveColumn(c)}
                  >
                    <X className="size-4 stroke-[1.5]" aria-hidden />
                  </button>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, row) => (
            <tr key={r.profileId} className="hover:bg-surface/50">
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-line bg-background px-3 py-1 text-left font-normal whitespace-nowrap"
              >
                <span className="flex items-center gap-2">
                  <PersonDot color={r.color} /> {r.name}
                </span>
                {r.sublabel ? (
                  <span className="block pl-4 text-[0.6875rem] text-subtle">{r.sublabel}</span>
                ) : null}
              </th>
              <td className="border-b border-l border-line p-0">
                <span className="flex items-center">
                  <input
                    type="text"
                    aria-label={`Commento per ${r.name}`}
                    placeholder="Scrivi un commento…"
                    maxLength={4000}
                    disabled={disabled}
                    value={comments[r.profileId] ?? ""}
                    title={comments[r.profileId] || undefined}
                    onChange={(e) => onComment(r.profileId, e.target.value)}
                    className={cn(
                      "h-11 w-full min-w-0 border-0 bg-transparent px-2 text-sm outline-none placeholder:text-subtle",
                      "focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--foreground)]",
                      changedComments.has(r.profileId) && "text-warning",
                    )}
                  />
                  <button
                    type="button"
                    className="grid size-9 shrink-0 place-items-center text-muted hover:text-foreground"
                    aria-label={`Scrivi un commento lungo per ${r.name}`}
                    title="Apri per un testo lungo"
                    disabled={disabled}
                    onClick={() => onExpandComment(r.profileId)}
                  >
                    <Maximize2 className="size-3.5 stroke-[1.5]" aria-hidden />
                  </button>
                </span>
              </td>
              <td
                className="border-b border-l border-line px-2 text-center text-muted nums"
                title="Ore dai turni della settimana: si cambiano dal foglio Turni."
              >
                {r.hours}
              </td>
              {columns.map((c) => (
                <td
                  key={c.kpiId}
                  className={cn("border-b border-l border-line p-0", c.mixed && "bg-surface/60")}
                >
                  <NumberCell
                    text={getText(r.profileId, c.kpiId)}
                    label={`${r.name} · ${c.label}`}
                    table={tableId}
                    row={row}
                    col={c.kpiId}
                    disabled={disabled}
                    onCommit={(text) => onCell(r.profileId, c.kpiId, text)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 border-b border-line bg-background px-3 py-2 text-left eyebrow font-semibold"
            >
              Assegnati
            </th>
            <td className="border-b border-l border-line" />
            <td className="border-b border-l border-line px-2 text-center nums">{totals.hours}</td>
            {columns.map((c) => (
              <td
                key={c.kpiId}
                className="border-b border-l border-line px-2 py-2 text-center nums"
              >
                {totals.byKpi[c.kpiId] ?? ""}
              </td>
            ))}
          </tr>
          {storeTargets ? (
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-background px-3 py-2 text-left eyebrow font-semibold"
              >
                Obiettivo negozio
              </th>
              <td className="border-l border-line" />
              <td className="border-l border-line" />
              {columns.map((c) => (
                <td
                  key={c.kpiId}
                  className="border-l border-line px-2 py-2 text-center text-muted nums"
                >
                  {storeTargets[c.kpiId] ?? ""}
                </td>
              ))}
            </tr>
          ) : null}
        </tfoot>
      </table>
    </div>
  );
}
