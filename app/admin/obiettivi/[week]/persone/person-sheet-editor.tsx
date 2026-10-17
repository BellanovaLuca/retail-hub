"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  SpreadsheetGrid,
  type CellChange,
  type CellState,
  type GridColumn,
  type GridRow,
  type SaveState,
} from "@/components/spreadsheet";
import { AutoSaveTextarea } from "@/components/targets/auto-save-textarea";
import { entryKey, useEntryAutosave } from "@/components/targets/use-entry-autosave";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormMessage, Textarea } from "@/components/ui/form";
import {
  buildPersonSheet,
  formatCount,
  parseCount,
  remainingText,
  type EntryValue,
} from "@/lib/kpi/sheet";
import type { TargetZone } from "@/lib/targets";
import {
  publishWeekComments,
  saveEntriesAsAdmin,
  saveTargetCell,
  saveWeekComment,
} from "../../actions";

const DONE = "done";
const REMAINING = "remaining";
const TARGET = "target";
const COMMENT = "comment";
const GENERAL = "general";

type CommentState = { body: string; published: boolean };

export function PersonSheetEditor(props: {
  profileId: string;
  name: string;
  zone: TargetZone;
  weekStart: string;
  days: string[];
  today: string;
  kpis: { kpiId: string; code: string; label: string }[];
  targets: Record<string, number>;
  entries: EntryValue[];
  comments: { kpiId: string | null; body: string; published: boolean }[];
  note: string;
}) {
  const { profileId, weekStart, days, today, kpis } = props;
  const router = useRouter();
  const [message, setMessage] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [aux, setAux] = React.useState<SaveState>("idle");
  const [pendingPublish, startPublish] = React.useTransition();
  const [editing, setEditing] = React.useState<string | null>(null);

  const initialValues = React.useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const e of props.entries) out[entryKey(e.kpiId, e.date)] = e.value;
    return out;
  }, [props.entries]);
  const entries = useEntryAutosave(initialValues, (changes) =>
    saveEntriesAsAdmin({ profileId, weekStart, changes }),
  );

  const [targets, setTargets] = React.useState(props.targets);
  const [comments, setComments] = React.useState<Record<string, CommentState>>(() =>
    Object.fromEntries(
      props.comments.map((c) => [c.kpiId ?? GENERAL, { body: c.body, published: c.published }]),
    ),
  );

  const rows = React.useMemo(
    () =>
      buildPersonSheet({
        days,
        kpis,
        targets,
        comments: Object.fromEntries(Object.entries(comments).map(([k, c]) => [k, c.body])),
        entries: Object.entries(entries.values)
          .filter(([, v]) => v !== null)
          .map(([key, v]) => {
            const [kpiId, date] = key.split("|");
            return { kpiId, date, value: v as number };
          }),
      }),
    [days, kpis, targets, comments, entries.values],
  );
  const rowById = React.useMemo(() => new Map(rows.map((r) => [r.kpiId, r])), [rows]);

  const unpublished = Object.values(comments).filter((c) => c.body && !c.published).length;
  const published = Object.values(comments).filter((c) => c.body && c.published).length;

  const runAux = React.useCallback(async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setAux("saving");
    const res = await fn();
    setAux(res.ok ? "saved" : "error");
    if (!res.ok) setMessage(res);
    return res.ok;
  }, []);

  const saveComment = React.useCallback(
    async (kpiId: string | null, body: string) => {
      const key = kpiId ?? GENERAL;
      const trimmed = body.trim();
      const before = comments[key];
      if ((before?.body ?? "") === trimmed) return { ok: true };
      setComments((c) => ({ ...c, [key]: { body: trimmed, published: false } }));
      const res = await saveWeekComment({ profileId, weekStart, kpiId, body: trimmed });
      if (!res.ok && before) setComments((c) => ({ ...c, [key]: before }));
      return res;
    },
    [comments, profileId, weekStart],
  );

  /* ---------------------------------------------------------- griglia */

  const columns: GridColumn[] = React.useMemo(
    () => [
      ...days.map((d) => {
        const l = format(parseISO(d), "EEE", { locale: it });
        return {
          id: d,
          label: l.charAt(0).toUpperCase() + l.slice(1),
          sublabel: format(parseISO(d), "d MMM", { locale: it }),
          width: 60,
          highlight: d === today,
          shaded: d > today,
        };
      }),
      { id: DONE, label: "A quanto sei", width: 96 },
      { id: REMAINING, label: "Quanto mi manca?", width: 150 },
      { id: TARGET, label: "Obiettivo", width: 84 },
      { id: COMMENT, label: "Commento week", width: 320 },
    ],
    [days, today],
  );
  const gridRows: GridRow[] = React.useMemo(
    () => kpis.map((k) => ({ id: k.kpiId, label: k.label })),
    [kpis],
  );

  const getValue = React.useCallback(
    (kpiId: string, col: string) => {
      const row = rowById.get(kpiId);
      if (!row) return "";
      if (col === DONE) return formatCount(row.done);
      if (col === REMAINING) return remainingText(row);
      if (col === TARGET) return row.target === null ? "" : formatCount(row.target);
      if (col === COMMENT) return comments[kpiId]?.body ?? "";
      return formatCount(entries.values[entryKey(kpiId, col)]);
    },
    [rowById, comments, entries.values],
  );

  const getCellState = React.useCallback(
    (kpiId: string, col: string): CellState | undefined => {
      if (col === DONE) return { readOnly: true, className: "font-medium bg-surface" };
      if (col === REMAINING)
        return { readOnly: true, tone: rowById.get(kpiId)?.reached ? "success" : undefined };
      if (col === TARGET) return { title: "Obiettivo della settimana (modificabile)" };
      if (col === COMMENT) {
        const c = comments[kpiId];
        return {
          className: "justify-start text-left whitespace-nowrap",
          title: c?.body
            ? `${c.published ? "Pubblicato" : "Da pubblicare"} · doppio clic per il testo lungo`
            : "Scrivi il commento sulla voce (doppio clic per il testo lungo)",
          tone: c?.body && !c.published ? "warning" : undefined,
        };
      }
      return undefined;
    },
    [rowById, comments],
  );

  const onChange = React.useCallback(
    (changes: CellChange[]) => {
      setMessage(null);
      const entryChanges = [];
      for (const c of changes) {
        if (c.colId === DONE || c.colId === REMAINING) continue;
        if (c.colId === COMMENT) {
          void runAux(() => saveComment(c.rowId, c.value));
          continue;
        }
        const v = parseCount(c.value);
        if (v === "invalid") {
          setMessage({ ok: false, message: "Scrivi un numero (es. 3)." });
          continue;
        }
        if (c.colId === TARGET) {
          const before = targets[c.rowId];
          setTargets((t) => {
            const next = { ...t };
            if (v === null) delete next[c.rowId];
            else next[c.rowId] = v;
            return next;
          });
          void runAux(async () => {
            const res = await saveTargetCell({ profileId, weekStart, kpiId: c.rowId, target: v });
            if (!res.ok)
              setTargets((t) => {
                const next = { ...t };
                if (before === undefined) delete next[c.rowId];
                else next[c.rowId] = before;
                return next;
              });
            return res;
          });
          continue;
        }
        entryChanges.push({ kpiId: c.rowId, date: c.colId, value: v });
      }
      entries.update(entryChanges);
    },
    [entries, runAux, saveComment, targets, profileId, weekStart],
  );

  const status: SaveState =
    entries.status === "error" || aux === "error"
      ? "error"
      : entries.status === "saving" || entries.status === "pending" || aux === "saving"
        ? "saving"
        : entries.status === "saved" || aux === "saved"
          ? "saved"
          : "idle";

  const editingRow = editing ? rowById.get(editing) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-light">{props.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {props.zone === "sole" ? "Sole" : props.zone === "jolly" ? "Jolly" : "Vista"} · numeri,
            obiettivi e commenti sono modificabili.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unpublished ? (
            <Badge tone="warning">{unpublished} da pubblicare</Badge>
          ) : published ? (
            <Badge tone="success">Commenti pubblicati</Badge>
          ) : null}
          <Button
            size="sm"
            disabled={pendingPublish || unpublished === 0}
            onClick={() =>
              startPublish(async () => {
                await entries.flush();
                const res = await publishWeekComments({ profileId, weekStart });
                setMessage(res);
                if (res.ok) {
                  setComments((c) =>
                    Object.fromEntries(
                      Object.entries(c).map(([k, v]) => [k, { ...v, published: true }]),
                    ),
                  );
                  router.refresh();
                }
              })
            }
          >
            <Send aria-hidden /> Pubblica commenti
          </Button>
        </div>
      </div>

      {kpis.length === 0 ? (
        <p className="font-display text-2xl font-light text-subtle">
          Nessuna voce: aggiungile dalla scheda Voci.
        </p>
      ) : (
        <SpreadsheetGrid
          ariaLabel={`Foglio della settimana di ${props.name}`}
          rows={gridRows}
          columns={columns}
          getValue={getValue}
          getCellState={getCellState}
          onChange={onChange}
          onCellActivate={(kpiId, col) => {
            if (col === COMMENT) setEditing(kpiId);
          }}
          rowHeaderLabel="Voce"
          saveState={status}
          className="[--grid-max-height:none]"
        />
      )}
      <FormMessage result={message} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Commento generale della settimana</CardTitle>
          <AutoSaveTextarea
            label="Commento"
            initialValue={comments[GENERAL]?.body ?? ""}
            placeholder="Es. Ottima settimana sui doppi, ora spingiamo le demo META."
            hint={
              comments[GENERAL]?.body
                ? comments[GENERAL].published
                  ? "Pubblicato: lo vede in cima alla sua pagina Obiettivi."
                  : "Da pubblicare."
                : "Lo vede in cima alla sua pagina Obiettivi dopo la pubblicazione."
            }
            onSave={(body) => saveComment(null, body)}
          />
        </Card>
        <Card>
          <CardTitle>La nota di {props.name}</CardTitle>
          {props.note ? (
            <p className="text-sm whitespace-pre-line">{props.note}</p>
          ) : (
            <p className="text-sm text-subtle">Nessuna nota per questa settimana.</p>
          )}
        </Card>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editingRow ? (
          <DialogContent title={`Commento · ${editingRow.label}`} description={props.name}>
            <CommentForm
              initial={comments[editingRow.kpiId]?.body ?? ""}
              onSubmit={async (body) => {
                const ok = await runAux(() => saveComment(editingRow.kpiId, body));
                if (ok) setEditing(null);
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function CommentForm({
  initial,
  onSubmit,
}: {
  initial: string;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = React.useState(initial);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(() => onSubmit(body));
      }}
    >
      <Textarea
        autoFocus
        value={body}
        maxLength={4000}
        rows={5}
        aria-label="Testo del commento"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setBody("")}>
          Svuota
        </Button>
        <Button type="submit" disabled={pending}>
          Salva
        </Button>
      </div>
    </form>
  );
}
