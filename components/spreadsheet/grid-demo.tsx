"use client";

import * as React from "react";
import { SpreadsheetGrid } from "./spreadsheet-grid";
import type {
  CellChange,
  CellState,
  FooterRow,
  GridColumn,
  GridGroup,
  GridRow,
  NormalizeResult,
  SaveState,
} from "./types";

/** Demo per /dev/design: 8 persone × 14 giorni con stato locale. */

const GROUPS: GridGroup[] = [
  { id: "vista", label: "Vista", collapsible: true },
  { id: "sole", label: "Sole", collapsible: true },
];

const ROWS: GridRow[] = [
  { id: "p1", label: "Francesca D.", sublabel: "40 h", groupId: "vista", accentColor: "#1f3a5f" },
  { id: "p2", label: "Fra R.", sublabel: "40 h", groupId: "vista", accentColor: "#6b7280" },
  { id: "p3", label: "Marta", sublabel: "32 h", groupId: "vista", accentColor: "#7c3aed" },
  { id: "p4", label: "Luca", sublabel: "24 h", groupId: "vista", accentColor: "#0e7490" },
  { id: "p5", label: "Francy", sublabel: "40 h", groupId: "sole", accentColor: "#a87b3d" },
  { id: "p6", label: "Giulia", sublabel: "32 h", groupId: "sole", accentColor: "#be123c" },
  { id: "p7", label: "Paolo", sublabel: "40 h", groupId: "sole", accentColor: "#15803d" },
  { id: "p8", label: "Sara", sublabel: "20 h", groupId: "sole", accentColor: "#4d7c0f" },
];

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const COLUMNS: GridColumn[] = Array.from({ length: 14 }, (_, i) => ({
  id: `d${i}`,
  label: WEEKDAYS[i % 7],
  sublabel: String(12 + i),
  width: 84,
  shaded: i % 7 >= 5,
  highlight: i === 4,
}));

const SEED: Record<string, string> = {
  "p1:d0": "10-20",
  "p1:d1": "10-20",
  "p1:d2": "R",
  "p1:d3": "10-14 16-20",
  "p2:d0": "MAN",
  "p2:d1": "MAN",
  "p2:d3": "F",
  "p2:d4": "F",
  "p3:d0": "12-20",
  "p3:d2": "F?",
  "p4:d1": "POM",
  "p5:d0": "R",
  "p5:d1": "12-20",
  "p5:d2": "12-20",
  "p6:d0": "10:30-20",
  "p7:d4": "MAN",
  "p8:d5": "10-14",
};

/** Ferie approvate: in sola lettura, a righe diagonali. */
const LOCKED = new Set(["p2:d3", "p2:d4"]);

const CODES = new Set(["MAN", "POM", "R", "F", "F?", "PE", "MA"]);
const TIME = /^(\d{1,2})(?:[:.](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?$/;

function normalize(raw: string): NormalizeResult {
  const v = raw.trim().toUpperCase();
  if (CODES.has(v)) return { value: v };
  const parts = v.split(/\s+(?=\d)/);
  const out: string[] = [];
  for (const part of parts) {
    const m = TIME.exec(part);
    if (!m) return { error: "Usa un codice (MAN, R, F…) o un orario come 10-14" };
    const [, h1, m1, h2, m2] = m;
    if (Number(h1) > 23 || Number(h2) > 24) return { error: "Ora non valida" };
    const fmt = (h: string, mm?: string) =>
      mm && mm !== "00" ? `${Number(h)}:${mm}` : String(Number(h));
    out.push(`${fmt(h1, m1)}-${fmt(h2, m2)}`);
  }
  return { value: out.join(" ") };
}

export function GridDemo() {
  const [data, setData] = React.useState<Record<string, string>>(SEED);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const timer = React.useRef<number | undefined>(undefined);

  const getValue = React.useCallback((r: string, c: string) => data[`${r}:${c}`] ?? "", [data]);

  const getCellState = React.useCallback(
    (r: string, c: string): CellState | undefined => {
      const key = `${r}:${c}`;
      const v = data[key];
      if (LOCKED.has(key)) return { readOnly: true, tone: "hatched", title: "Ferie approvate" };
      if (v === "F?") return { tone: "dashed", title: "Ferie da confermare" };
      if (v === "R") return { tone: "muted" };
      return undefined;
    },
    [data],
  );

  const renderCell = React.useCallback((_r: string, _c: string, v: string) => {
    if (v === "F") return "Ferie";
    if (v === "F?") return "Ferie?";
    return v;
  }, []);

  const onChange = React.useCallback((changes: CellChange[]) => {
    setData((prev) => {
      const next = { ...prev };
      for (const ch of changes) {
        const key = `${ch.rowId}:${ch.colId}`;
        if (ch.value === "") delete next[key];
        else next[key] = ch.value;
      }
      return next;
    });
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaveState("saved"), 700);
  }, []);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const footerRows: FooterRow[] = React.useMemo(() => {
    const cells: Record<string, React.ReactNode> = {};
    const low = new Set<string>();
    for (const col of COLUMNS) {
      const n = ROWS.filter((row) => {
        const v = data[`${row.id}:${col.id}`];
        return v && v !== "R" && !v.startsWith("F");
      }).length;
      cells[col.id] = n;
      if (n < 3) low.add(col.id);
    }
    return [
      {
        id: "presenti",
        label: "Presenti",
        cells,
        cellClassName: (colId) => (low.has(colId) ? "bg-danger/8 text-danger" : undefined),
      },
    ];
  }, [data]);

  return (
    <SpreadsheetGrid
      ariaLabel="Foglio turni di prova"
      rows={ROWS}
      columns={COLUMNS}
      groups={GROUPS}
      getValue={getValue}
      getCellState={getCellState}
      renderCell={renderCell}
      onChange={onChange}
      normalize={normalize}
      footerRows={footerRows}
      rowHeaderLabel="Persona"
      showDensityToggle
      saveState={saveState}
      presence={[{ id: "u2", name: "Marta" }]}
      highlightRowId="p3"
      toolbar={<p className="text-sm text-muted">Settimane 42–43 · bozza</p>}
    />
  );
}
