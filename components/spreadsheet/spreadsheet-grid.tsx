"use client";

import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { Check, ChevronDown, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { parseTSV, toTSV } from "./clipboard";
import { GridCell } from "./grid-cell";
import { DefaultMobileEditor, MobileSheet } from "./mobile-sheet";
import {
  type Bounds,
  type CellWrite,
  type Direction,
  type Pos,
  type Rect,
  type Selection,
  cellsIn,
  clampPos,
  extendTo,
  fillShortcutWrites,
  fillTarget,
  fillWrites,
  isSingleCell,
  move,
  moveToEdge,
  pasteWrites,
  readRect,
  rectContains,
  rectOf,
  selectAll,
  single,
} from "./selection";
import type {
  CellChange,
  Density,
  GridColumn,
  GridGroup,
  GridRow,
  SpreadsheetGridProps,
} from "./types";

/* ------------------------------------------------------------------ misure */

type Metrics = {
  rowH: number;
  groupH: number;
  headerH: number;
  rowHeaderW: number;
  colW: (col: GridColumn) => number;
  text: string;
};

function metricsFor(density: Density, mobile: boolean, hasSublabels: boolean): Metrics {
  const comfy = density === "comfortable";
  return {
    // Su touch i tocchi devono essere almeno di 44px (§9).
    rowH: mobile || comfy ? 44 : 32,
    groupH: mobile ? 44 : comfy ? 36 : 30,
    headerH: hasSublabels ? (comfy ? 56 : 46) : comfy ? 40 : 32,
    rowHeaderW: mobile ? 116 : comfy ? 200 : 168,
    colW: (col) => {
      const base = col.width ?? 72;
      return comfy || mobile ? Math.round(base * 1.25) : base;
    },
    text: comfy ? "text-sm" : "text-[0.8125rem]",
  };
}

/* ------------------------------------------------------------- telefono */

const MOBILE_QUERY = "(pointer: coarse), (max-width: 767px)";

function subscribeMobile(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

/** Schermo touch o più stretto di 768px: niente scorciatoie, si modifica dal foglio dal basso. */
function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeMobile,
    () => (typeof window !== "undefined" && window.matchMedia?.(MOBILE_QUERY).matches) || false,
    () => false,
  );
}

/* --------------------------------------------------------------- layout */

type Line =
  | { kind: "group"; group: GridGroup; count: number; collapsed: boolean; top: number }
  | { kind: "row"; row: GridRow; r: number; top: number };

type HistoryEntry = { forward: CellChange[]; backward: CellChange[] };

type Editing = { r: number; c: number; initial: string; mode: "enter" | "edit" };

type Drag = { kind: "select" } | { kind: "fill"; source: Rect };

const HISTORY_LIMIT = 100;

function isPrintableKey(e: React.KeyboardEvent) {
  if (e.key.length !== 1) return false;
  // AltGr su Windows arriva come Ctrl+Alt: è comunque un carattere (es. "@" sulla tastiera italiana).
  if (e.ctrlKey && e.altKey) return true;
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * Foglio di calcolo condiviso (§8): selezione, digitazione diretta, copia/incolla compatibile
 * con Excel, maniglia di riempimento, annulla/ripeti, colonne virtualizzate.
 */
export function SpreadsheetGrid({
  rows,
  columns,
  groups,
  getValue,
  renderCell,
  getCellState,
  onChange,
  normalize,
  readOnly = false,
  footerRows,
  rowHeaderLabel = "",
  density: densityProp = "compact",
  showDensityToggle = false,
  saveState = "idle",
  presence,
  toolbar,
  onCellActivate,
  onSelectionChange,
  renderMobileEditor,
  onRowHeaderClick,
  highlightRowId,
  ariaLabel,
  className,
}: SpreadsheetGridProps) {
  const editable = !!onChange && !readOnly;
  const mobile = useIsMobile();
  const gridId = React.useId();

  /* zoom: il prop è il valore iniziale; se cambia, si riallinea */
  const [density, setDensity] = React.useState<Density>(densityProp);
  const [prevDensityProp, setPrevDensityProp] = React.useState(densityProp);
  if (prevDensityProp !== densityProp) {
    setPrevDensityProp(densityProp);
    setDensity(densityProp);
  }

  const hasSublabels = columns.some((c) => c.sublabel);
  const m = React.useMemo(
    () => metricsFor(density, mobile, hasSublabels),
    [density, mobile, hasSublabels],
  );

  /* ---------------------------------------------- righe visibili e gruppi */

  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());

  const { lines, visibleRows, bodyHeight } = React.useMemo(() => {
    const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
    const counts = new Map<string, number>();
    for (const row of rows)
      if (row.groupId) counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
    const out: Line[] = [];
    const visible: GridRow[] = [];
    let top = 0;
    let prevGroup: string | undefined;
    for (const row of rows) {
      const group = row.groupId ? groupById.get(row.groupId) : undefined;
      if (group && row.groupId !== prevGroup) {
        out.push({
          kind: "group",
          group,
          count: counts.get(group.id) ?? 0,
          collapsed: collapsed.has(group.id),
          top,
        });
        top += m.groupH;
      }
      prevGroup = row.groupId;
      if (group && collapsed.has(group.id)) continue;
      out.push({ kind: "row", row, r: visible.length, top });
      visible.push(row);
      top += m.rowH;
    }
    return { lines: out, visibleRows: visible, bodyHeight: top };
  }, [rows, groups, collapsed, m.groupH, m.rowH]);

  const rowTop = React.useMemo(() => {
    const tops: number[] = [];
    for (const line of lines) if (line.kind === "row") tops.push(line.top);
    return tops;
  }, [lines]);

  const widths = React.useMemo(() => columns.map(m.colW), [columns, m]);
  const colLeft = React.useMemo(() => {
    const lefts: number[] = [];
    let x = m.rowHeaderW;
    for (const w of widths) {
      lefts.push(x);
      x += w;
    }
    return lefts;
  }, [widths, m.rowHeaderW]);
  const totalWidth = m.rowHeaderW + widths.reduce((a, b) => a + b, 0);

  const bounds: Bounds = React.useMemo(
    () => ({ rows: visibleRows.length, cols: columns.length }),
    [visibleRows.length, columns.length],
  );
  const hasCells = bounds.rows > 0 && bounds.cols > 0;

  /* ------------------------------------------------------------ selezione */

  const [rawSel, setSel] = React.useState<Selection>(() => single({ r: 0, c: 0 }));
  const sel: Selection = {
    anchor: clampPos(rawSel.anchor, bounds),
    focus: clampPos(rawSel.focus, bounds),
  };
  const rect = rectOf(sel);
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  React.useEffect(() => {
    if (!onSelectionChangeRef.current || !hasCells) return;
    const rowIds = visibleRows.slice(rect.r1, rect.r2 + 1).map((r) => r.id);
    const colIds = columns.slice(rect.c1, rect.c2 + 1).map((c) => c.id);
    onSelectionChangeRef.current({ rowIds, colIds });
  }, [rect.r1, rect.r2, rect.c1, rect.c2, hasCells]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const editingRef = React.useRef<Editing | null>(null);
  editingRef.current = editing;
  const [editError, setEditError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [fillPreview, setFillPreview] = React.useState<Rect | null>(null);
  const [sheet, setSheet] = React.useState<{ r: number; c: number } | null>(null);
  const [sheetError, setSheetError] = React.useState<string | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pendingFocus = React.useRef(false);
  const undoStack = React.useRef<HistoryEntry[]>([]);
  const redoStack = React.useRef<HistoryEntry[]>([]);

  React.useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /* ---------------------------------------------- virtualizzazione colonne */

  const anchorC = sel.anchor.c;
  const focusC = sel.focus.c;
  const rangeExtractor = React.useCallback(
    (range: Range) => {
      // La cella attiva (e l'estremo della selezione) restano sempre nel DOM, così il focus
      // non si perde quando escono dalla vista e scrollIntoView funziona anche sui salti lunghi.
      const base = defaultRangeExtractor(range);
      const extra = new Set([anchorC, focusC].filter((i) => i < range.count && !base.includes(i)));
      return extra.size ? [...base, ...extra].sort((a, b) => a - b) : base;
    },
    [anchorC, focusC],
  );

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => widths[i] ?? 72,
    paddingStart: m.rowHeaderW,
    overscan: 6,
    rangeExtractor,
  });

  React.useEffect(() => {
    virtualizer.measure();
  }, [widths, virtualizer]);

  const virtualCols = virtualizer.getVirtualItems().map((v) => v.index);

  /* ---------------------------------------------------------- lettura dati */

  const read = React.useCallback(
    (r: number, c: number) => {
      const row = visibleRows[r];
      const col = columns[c];
      return row && col ? getValue(row.id, col.id) : "";
    },
    [visibleRows, columns, getValue],
  );

  const isCellReadOnly = (r: number, c: number) => {
    if (!editable) return true;
    const row = visibleRows[r];
    const col = columns[c];
    if (!row || !col) return true;
    return !!getCellState?.(row.id, col.id)?.readOnly;
  };

  /* ------------------------------------------------------------ scrittura */

  /** Applica le scritture: salta celle in sola lettura e invariate; una sola onChange. */
  const emit = (writes: CellWrite[], { validate }: { validate: boolean }) => {
    if (!editable || !onChange) return false;
    const forward: CellChange[] = [];
    const backward: CellChange[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const w of writes) {
      const row = visibleRows[w.r];
      const col = columns[w.c];
      if (!row || !col) continue;
      const key = `${w.r}:${w.c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (getCellState?.(row.id, col.id)?.readOnly) continue;
      let value = w.value.trim();
      if (validate && value !== "" && normalize) {
        const res = normalize(value);
        if ("error" in res) {
          errors.push(res.error);
          continue;
        }
        value = res.value;
      }
      const old = getValue(row.id, col.id);
      if (old === value) continue;
      forward.push({ rowId: row.id, colId: col.id, value });
      backward.push({ rowId: row.id, colId: col.id, value: old });
    }
    if (errors.length) {
      setNotice(
        errors.length === 1
          ? errors[0]
          : `${errors.length} valori non validi ignorati. ${errors[0]}`,
      );
    }
    if (forward.length === 0) return false;
    undoStack.current.push({ forward, backward });
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
    onChange(forward);
    return true;
  };

  const undo = () => {
    const entry = undoStack.current.pop();
    if (!entry || !onChange) return;
    redoStack.current.push(entry);
    onChange(entry.backward);
  };

  const redo = () => {
    const entry = redoStack.current.pop();
    if (!entry || !onChange) return;
    undoStack.current.push(entry);
    onChange(entry.forward);
  };

  /** Valida un singolo valore digitato. */
  const check = (value: string): { value: string } | { error: string } => {
    const v = value.trim();
    if (v === "" || !normalize) return { value: v };
    return normalize(v);
  };

  /* -------------------------------------------------------------- editor */

  const startEdit = (r: number, c: number, mode: Editing["mode"], initial?: string) => {
    if (!hasCells) return;
    if (isCellReadOnly(r, c)) {
      if (editable) setNotice("Cella non modificabile");
      return;
    }
    setEditError(null);
    setEditing({ r, c, mode, initial: initial ?? read(r, c) });
  };

  const finishEdit = (
    value: string | null,
    dir: Direction | null,
    { fromBlur = false }: { fromBlur?: boolean } = {},
  ) => {
    const ed = editingRef.current;
    if (!ed) return;
    if (value !== null) {
      const res = check(value);
      if ("error" in res) {
        if (!fromBlur) {
          setEditError(res.error);
          return;
        }
        setNotice(res.error);
      } else {
        emit([{ r: ed.r, c: ed.c, value: res.value }], { validate: false });
      }
    }
    editingRef.current = null;
    setEditing(null);
    setEditError(null);
    if (!fromBlur) {
      pendingFocus.current = true;
      if (dir) setSel(move(single({ r: ed.r, c: ed.c }), dir, bounds));
    }
  };

  /* --------------------------------------------- focus e scroll alla cella */

  React.useLayoutEffect(() => {
    if (editing || !hasCells) return;
    const root = scrollRef.current;
    if (!root) return;
    const activeEl = document.activeElement as HTMLElement | null;
    const cellHasFocus =
      !!activeEl && root.contains(activeEl) && activeEl.hasAttribute("data-cell");
    if (!pendingFocus.current && !cellHasFocus) return;
    pendingFocus.current = false;
    const find = (p: Pos) =>
      root.querySelector<HTMLElement>(`[data-cell][data-r="${p.r}"][data-c="${p.c}"]`);
    const anchorEl = find(sel.anchor);
    if (anchorEl && activeEl !== anchorEl) anchorEl.focus({ preventScroll: true });
    const target = find(sel.focus) ?? anchorEl;
    target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [sel.anchor.r, sel.anchor.c, sel.focus.r, sel.focus.c, editing, hasCells]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (next: Selection) => {
    pendingFocus.current = true;
    setSel(next);
  };

  /* -------------------------------------------------------------- tastiera */

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mobile || !hasCells || editingRef.current) return;
    const target = e.target as HTMLElement;
    if (!target.hasAttribute("data-cell")) return;
    const mod = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key;
    const lower = key.toLowerCase();

    const done = () => e.preventDefault();

    if (mod && !e.altKey) {
      if (lower === "a") return (done(), navigate(selectAll(bounds)));
      if (lower === "z" && !shift) return (done(), undo());
      if ((lower === "z" && shift) || lower === "y") return (done(), redo());
      if (lower === "d" || lower === "r") {
        done();
        const writes = fillShortcutWrites(sel, lower === "d" ? "down" : "right", read);
        emit(writes, { validate: false });
        return;
      }
      if (lower === "c" || lower === "x" || lower === "v") return; // eventi copy/cut/paste nativi
    }

    switch (key) {
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight": {
        done();
        const dir = key.slice(5).toLowerCase() as Direction;
        return navigate(move(sel, dir, bounds, { extend: shift, jump: mod }));
      }
      case "Tab": {
        const dir: Direction = shift ? "left" : "right";
        // Al bordo della griglia Tab esce dal foglio (non intrappoliamo il focus).
        if (
          (dir === "right" && sel.anchor.c >= bounds.cols - 1) ||
          (dir === "left" && sel.anchor.c <= 0)
        )
          return;
        done();
        return navigate(move(sel, dir, bounds));
      }
      case "Enter": {
        done();
        if (e.altKey) {
          if (onCellActivate) {
            const row = visibleRows[sel.anchor.r];
            const col = columns[sel.anchor.c];
            if (row && col) onCellActivate(row.id, col.id);
          }
          return;
        }
        return navigate(move(sel, shift ? "up" : "down", bounds));
      }
      case "Home":
      case "End":
        done();
        return navigate(
          moveToEdge(sel, key === "Home" ? "home" : "end", bounds, { extend: shift, ctrl: mod }),
        );
      case "PageUp":
      case "PageDown":
        done();
        return navigate(
          move(sel, key === "PageUp" ? "up" : "down", bounds, { extend: shift, step: 10 }),
        );
      case "F2":
        done();
        return startEdit(sel.anchor.r, sel.anchor.c, "edit");
      case "Escape":
        if (!isSingleCell(sel)) {
          done();
          navigate(single(sel.anchor));
        }
        return;
      case "Delete":
      case "Backspace":
        done();
        if (!editable) return;
        emit(
          cellsIn(rect).map((p) => ({ ...p, value: "" })),
          { validate: false },
        );
        return;
    }

    if (isPrintableKey(e)) {
      if (!editable) return;
      done();
      startEdit(sel.anchor.r, sel.anchor.c, "enter", key);
    }
  };

  /* ------------------------------------------------------- appunti (documento) */

  const clipboardRef = React.useRef<{
    copy: (e: ClipboardEvent) => void;
    cut: (e: ClipboardEvent) => void;
    paste: (e: ClipboardEvent) => void;
  } | null>(null);

  React.useLayoutEffect(() => {
    const owns = () => {
      const root = scrollRef.current;
      const el = document.activeElement;
      return (
        !!root && !!el && root.contains(el) && el.hasAttribute("data-cell") && !editingRef.current
      );
    };
    const writeClipboard = (e: ClipboardEvent) => {
      const tsv = toTSV(readRect(rect, read));
      e.clipboardData?.setData("text/plain", tsv);
      e.preventDefault();
    };
    clipboardRef.current = {
      copy: (e) => {
        if (!owns() || !hasCells) return;
        writeClipboard(e);
      },
      cut: (e) => {
        if (!owns() || !hasCells) return;
        writeClipboard(e);
        emit(
          cellsIn(rect).map((p) => ({ ...p, value: "" })),
          { validate: false },
        );
      },
      paste: (e) => {
        if (!owns() || !hasCells) return;
        e.preventDefault();
        if (!editable) return;
        const text = e.clipboardData?.getData("text/plain") ?? "";
        const matrix = parseTSV(text);
        const writes = pasteWrites(matrix, sel, bounds);
        if (writes.length === 0) return;
        emit(writes, { validate: true });
        // Come Excel: dopo l'incolla resta selezionata l'area incollata.
        const last = writes[writes.length - 1];
        const first = writes[0];
        pendingFocus.current = true;
        setSel({ anchor: { r: first.r, c: first.c }, focus: { r: last.r, c: last.c } });
      },
    };
  });

  React.useEffect(() => {
    const onCopy = (e: ClipboardEvent) => clipboardRef.current?.copy(e);
    const onCut = (e: ClipboardEvent) => clipboardRef.current?.cut(e);
    const onPaste = (e: ClipboardEvent) => clipboardRef.current?.paste(e);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  /* --------------------------------------------------------------- mouse */

  const dragRef = React.useRef<Drag | null>(null);
  const fillRef = React.useRef<Rect | null>(null);
  const finishFillRef = React.useRef<() => void>(() => {});
  finishFillRef.current = () => {
    const drag = dragRef.current;
    const target = fillRef.current;
    if (!drag || drag.kind !== "fill" || !target) return;
    emit(fillWrites(drag.source, target, read), { validate: false });
    pendingFocus.current = true;
    setSel({
      anchor: { r: target.r1, c: target.c1 },
      focus: { r: target.r2, c: target.c2 },
    });
  };

  const posFrom = (el: Element | null): Pos | null => {
    const cell = el?.closest<HTMLElement>("[data-cell]");
    if (!cell || !scrollRef.current?.contains(cell)) return null;
    return { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
  };

  const startDrag = (drag: Drag) => {
    dragRef.current = drag;
    const onMove = (ev: PointerEvent) => {
      const root = scrollRef.current;
      if (!root) return;
      // Scorrimento automatico vicino ai bordi.
      const box = root.getBoundingClientRect();
      const edge = 28;
      if (ev.clientX > box.right - edge) root.scrollLeft += 24;
      else if (ev.clientX < box.left + m.rowHeaderW + 8) root.scrollLeft -= 24;
      if (ev.clientY > box.bottom - edge) root.scrollTop += 16;
      else if (ev.clientY < box.top + m.headerH + 4) root.scrollTop -= 16;
      const p = posFrom(document.elementFromPoint?.(ev.clientX, ev.clientY) ?? null);
      if (!p) return;
      const d = dragRef.current;
      if (d?.kind === "select") {
        setSel((s) => (s.focus.r === p.r && s.focus.c === p.c ? s : extendTo(s, p)));
      } else if (d?.kind === "fill") {
        const t = fillTarget(d.source, p);
        fillRef.current = t;
        setFillPreview(t);
      }
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (dragRef.current?.kind === "fill") finishFillRef.current();
      dragRef.current = null;
      fillRef.current = null;
      setFillPreview(null);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = posFrom(e.target as Element);
    if (!p) return;
    if (mobile) {
      setSel(single(p));
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      navigate(extendTo(sel, p));
    } else {
      pendingFocus.current = true;
      setSel(single(p));
    }
    startDrag({ kind: "select" });
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mobile) return;
    const p = posFrom(e.target as Element);
    if (!p || isCellReadOnly(p.r, p.c)) return;
    setSheetError(null);
    setSheet(p);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mobile) return;
    const p = posFrom(e.target as Element);
    if (!p) return;
    if (onCellActivate) {
      const row = visibleRows[p.r];
      const col = columns[p.c];
      if (row && col) onCellActivate(row.id, col.id);
      return;
    }
    startEdit(p.r, p.c, "edit");
  };

  const onFillHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag({ kind: "fill", source: rect });
  };

  /* ------------------------------------------------------------ rendering */

  const rectBox = (rc: Rect) => {
    const top = rowTop[rc.r1] ?? 0;
    const bottom = (rowTop[rc.r2] ?? 0) + m.rowH;
    const left = colLeft[rc.c1] ?? 0;
    const right = (colLeft[rc.c2] ?? 0) + (widths[rc.c2] ?? 0);
    return { top, left, width: right - left, height: bottom - top };
  };

  const footers = footerRows ?? [];
  const footerHeight = footers.length * m.rowH;
  const ariaRowCount = 1 + lines.length + footers.length;
  const multi = !isSingleCell(sel);
  const showOverlay = hasCells && !editing;
  const selBox = hasCells ? rectBox(rect) : null;

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sheetRow = sheet ? visibleRows[sheet.r] : undefined;
  const sheetCol = sheet ? columns[sheet.c] : undefined;
  const closeSheet = () => {
    setSheet(null);
    setSheetError(null);
  };
  const commitSheet = (value: string) => {
    if (!sheet) return;
    const res = check(value);
    if ("error" in res) {
      setSheetError(res.error);
      return;
    }
    emit([{ r: sheet.r, c: sheet.c, value: res.value }], { validate: false });
    closeSheet();
  };

  const presenceNames = (presence ?? []).map((p) => p.name);
  const showBar =
    !!toolbar || showDensityToggle || saveState !== "idle" || presenceNames.length > 0;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {showBar ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            {presenceNames.length > 0 ? (
              <p className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
                {presenceNames.length === 1
                  ? "Sta modificando anche: "
                  : "Stanno modificando anche: "}
                <span className="text-foreground">{presenceNames.join(", ")}</span>
              </p>
            ) : null}
            <SaveIndicator state={saveState} />
            {showDensityToggle ? (
              <div role="group" aria-label="Zoom" className="flex rounded-md border border-line">
                {(
                  [
                    ["compact", "Compatto"],
                    ["comfortable", "Comodo"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={density === value}
                    onClick={() => setDensity(value)}
                    className={cn(
                      "h-8 px-2.5 text-xs transition-colors",
                      density === value
                        ? "bg-foreground text-background"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        role="grid"
        id={gridId}
        aria-label={ariaLabel}
        aria-rowcount={ariaRowCount}
        aria-colcount={columns.length + 1}
        aria-multiselectable
        aria-readonly={!editable || undefined}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={cn(
          "relative max-h-[var(--grid-max-height,75vh)] min-h-0 overflow-auto overscroll-contain rounded-md border border-line bg-background nums select-none",
          m.text,
        )}
        style={{
          scrollPaddingLeft: m.rowHeaderW,
          scrollPaddingTop: m.headerH,
          scrollPaddingBottom: footerHeight,
        }}
      >
        <div style={{ width: totalWidth }} className="relative">
          {/* Intestazione colonne */}
          <div role="rowgroup" className="sticky top-0 z-30 bg-background">
            <div
              role="row"
              aria-rowindex={1}
              className="relative"
              style={{ height: m.headerH, width: totalWidth }}
            >
              <div
                role="columnheader"
                aria-colindex={1}
                className="sticky left-0 z-10 flex h-full items-end border-r border-b border-line-strong bg-background px-3 pb-2 eyebrow"
                style={{ width: m.rowHeaderW }}
              >
                {rowHeaderLabel}
              </div>
              {virtualCols.map((c) => {
                const col = columns[c];
                return (
                  <div
                    key={col.id}
                    role="columnheader"
                    aria-colindex={c + 2}
                    title={col.sublabel ? `${col.label} ${col.sublabel}` : col.label}
                    className={cn(
                      "absolute top-0 flex h-full flex-col items-center justify-end overflow-hidden border-r border-b border-line border-b-line-strong px-1 pb-1.5 text-center whitespace-nowrap",
                      col.shaded && "bg-surface",
                      col.highlight && "border-t-[3px] border-t-foreground",
                    )}
                    style={{ left: colLeft[c], width: widths[c] }}
                  >
                    <span className={cn("eyebrow", col.highlight && "text-foreground")}>
                      {col.label}
                    </span>
                    {col.sublabel ? (
                      <span
                        className={cn(
                          "text-xs leading-tight nums",
                          col.highlight ? "font-semibold text-foreground" : "text-muted",
                        )}
                      >
                        {col.sublabel}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Corpo */}
          <div role="rowgroup" className="relative" style={{ height: bodyHeight }}>
            {lines.map((line, i) => {
              if (line.kind === "group") {
                const { group } = line;
                return (
                  <div
                    key={`g:${group.id}`}
                    role="row"
                    aria-rowindex={i + 2}
                    className="relative border-b border-line bg-surface"
                    style={{ height: m.groupH, width: totalWidth }}
                  >
                    <div
                      role="rowheader"
                      aria-colindex={1}
                      aria-colspan={columns.length + 1}
                      className="sticky left-0 flex h-full w-max items-center px-3"
                    >
                      {group.collapsible ? (
                        <button
                          type="button"
                          aria-expanded={!line.collapsed}
                          onClick={() => toggleGroup(group.id)}
                          className="-mx-1 flex h-full items-center gap-1.5 rounded-sm px-1 eyebrow hover:text-foreground"
                        >
                          {line.collapsed ? (
                            <ChevronRight aria-hidden className="size-3.5 stroke-[1.5]" />
                          ) : (
                            <ChevronDown aria-hidden className="size-3.5 stroke-[1.5]" />
                          )}
                          {group.label}
                          <span className="font-normal text-subtle nums">{line.count}</span>
                        </button>
                      ) : (
                        <span className="eyebrow">{group.label}</span>
                      )}
                    </div>
                  </div>
                );
              }
              const { row, r } = line;
              const highlighted = row.id === highlightRowId;
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={i + 2}
                  className={cn("relative", highlighted && "bg-foreground/[0.04]")}
                  style={{ height: m.rowH, width: totalWidth }}
                >
                  <RowHeader
                    row={row}
                    width={m.rowHeaderW}
                    highlighted={highlighted}
                    onClick={onRowHeaderClick}
                  />
                  {virtualCols.map((c) => {
                    const col = columns[c];
                    const value = getValue(row.id, col.id);
                    const state = getCellState?.(row.id, col.id);
                    return (
                      <GridCell
                        key={col.id}
                        r={r}
                        c={c}
                        rowId={row.id}
                        colId={col.id}
                        rowLabel={row.label}
                        colLabel={col.sublabel ? `${col.label} ${col.sublabel}` : col.label}
                        value={value}
                        left={colLeft[c]}
                        width={widths[c]}
                        height={m.rowH}
                        active={hasCells && sel.anchor.r === r && sel.anchor.c === c}
                        selected={rectContains(rect, r, c)}
                        readOnly={!editable || !!state?.readOnly}
                        tone={state?.tone ?? "default"}
                        title={state?.title}
                        className={cn(
                          col.shaded && "bg-surface/60",
                          col.className,
                          row.className,
                          state?.className,
                        )}
                        renderCell={renderCell}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Selezione, maniglia, anteprima riempimento, editor */}
            {showOverlay && selBox ? (
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute z-[7]",
                  multi && "border border-foreground bg-foreground/5",
                )}
                style={selBox}
              >
                {editable && !mobile ? (
                  <div
                    data-fill-handle=""
                    onPointerDown={onFillHandleDown}
                    title="Trascina per riempire"
                    className="pointer-events-auto absolute -right-px -bottom-px size-[9px] cursor-crosshair border-t-2 border-l-2 border-background bg-foreground"
                  />
                ) : null}
              </div>
            ) : null}
            {fillPreview ? (
              <div
                aria-hidden
                className="pointer-events-none absolute z-[7] border border-dashed border-foreground"
                style={rectBox(fillPreview)}
              />
            ) : null}
            {editing ? (
              <CellEditor
                key={`${editing.r}:${editing.c}`}
                editing={editing}
                error={editError}
                label={`Modifica ${visibleRows[editing.r]?.label ?? ""}, ${columns[editing.c]?.label ?? ""}`}
                style={{
                  top: rowTop[editing.r] ?? 0,
                  left: colLeft[editing.c] ?? 0,
                  height: m.rowH,
                  minWidth: widths[editing.c] ?? 72,
                }}
                onFinish={finishEdit}
              />
            ) : null}
          </div>

          {/* Righe di riepilogo, fisse in basso */}
          {footers.length > 0 ? (
            <div
              role="rowgroup"
              className="sticky bottom-0 z-30 border-t border-line-strong bg-background"
            >
              {footers.map((f, i) => (
                <div
                  key={f.id}
                  role="row"
                  aria-rowindex={lines.length + 2 + i}
                  className="relative"
                  style={{ height: m.rowH, width: totalWidth }}
                >
                  <div
                    role="rowheader"
                    aria-colindex={1}
                    className="sticky left-0 z-10 flex h-full items-center border-r border-b border-line bg-background px-3 eyebrow"
                    style={{ width: m.rowHeaderW }}
                  >
                    <span className="truncate">{f.label}</span>
                  </div>
                  {virtualCols.map((c) => {
                    const col = columns[c];
                    return (
                      <div
                        key={col.id}
                        role="gridcell"
                        aria-colindex={c + 2}
                        className={cn(
                          "absolute top-0 flex h-full items-center justify-center overflow-hidden border-r border-b border-line px-1 text-xs whitespace-nowrap text-muted",
                          col.shaded && "bg-surface/60",
                          f.cellClassName?.(col.id),
                        )}
                        style={{ left: colLeft[c], width: widths[c] }}
                      >
                        {f.cells[col.id] ?? null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 pt-2 text-xs text-danger">
        {notice}
      </p>

      {mobile && sheet && sheetRow && sheetCol ? (
        <MobileSheet
          open
          title={`${sheetRow.label} · ${sheetCol.label}${sheetCol.sublabel ? ` ${sheetCol.sublabel}` : ""}`}
          description={
            read(sheet.r, sheet.c) ? `Valore attuale: ${read(sheet.r, sheet.c)}` : "Cella vuota"
          }
          error={sheetError}
          onOpenChange={(open) => !open && closeSheet()}
        >
          {renderMobileEditor ? (
            renderMobileEditor({
              rowId: sheetRow.id,
              colId: sheetCol.id,
              value: read(sheet.r, sheet.c),
              close: closeSheet,
              commit: commitSheet,
            })
          ) : (
            <DefaultMobileEditor
              value={read(sheet.r, sheet.c)}
              close={closeSheet}
              commit={commitSheet}
            />
          )}
        </MobileSheet>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- sottocomponenti */

const RowHeader = React.memo(function RowHeader({
  row,
  width,
  highlighted,
  onClick,
}: {
  row: GridRow;
  width: number;
  highlighted: boolean;
  onClick?: (rowId: string) => void;
}) {
  const content = (
    <>
      <span className={cn("truncate", highlighted ? "font-semibold" : "font-medium")}>
        {row.label}
      </span>
      {row.sublabel ? (
        <span className="truncate text-xs font-normal text-muted">{row.sublabel}</span>
      ) : null}
    </>
  );
  return (
    <div
      role="rowheader"
      aria-colindex={1}
      className={cn(
        "sticky left-0 z-10 flex h-full items-center border-r border-b border-line",
        highlighted ? "bg-surface" : "bg-background",
      )}
      style={{
        width,
        boxShadow: row.accentColor ? `inset 2px 0 0 ${row.accentColor}` : undefined,
      }}
    >
      {onClick ? (
        <button
          type="button"
          onClick={() => onClick(row.id)}
          className="flex h-full w-full min-w-0 items-baseline gap-2 px-3 text-left hover:underline"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 items-baseline gap-2 px-3">{content}</div>
      )}
    </div>
  );
});

function CellEditor({
  editing,
  error,
  label,
  style,
  onFinish,
}: {
  editing: Editing;
  error: string | null;
  label: string;
  style: React.CSSProperties;
  onFinish: (value: string | null, dir: Direction | null, opts?: { fromBlur?: boolean }) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const value = e.currentTarget.value;
    const arrows: Record<string, Direction> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    if (e.key === "Enter") {
      e.preventDefault();
      onFinish(value, e.shiftKey ? "up" : "down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      onFinish(value, e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFinish(null, null);
    } else if (editing.mode === "enter" && arrows[e.key]) {
      // In modalità "Immissione" (digitazione diretta) le frecce confermano e spostano, come Excel.
      e.preventDefault();
      onFinish(value, arrows[e.key]);
    }
  };

  return (
    <div className="absolute z-20" style={style}>
      <input
        ref={ref}
        defaultValue={editing.initial}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={onKeyDown}
        onBlur={(e) => onFinish(e.currentTarget.value, null, { fromBlur: true })}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          "h-full w-full min-w-36 bg-background px-1.5 nums outline-2 -outline-offset-2 outline-foreground",
          error && "outline-danger",
        )}
      />
      {error ? (
        <p
          role="alert"
          className="absolute top-full left-0 mt-1 rounded-sm bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state }: { state: SpreadsheetGridProps["saveState"] }) {
  if (!state || state === "idle") return <span aria-live="polite" className="sr-only" />;
  return (
    <p aria-live="polite" className="flex items-center gap-1.5">
      {state === "saving" ? (
        <>
          <LoaderCircle aria-hidden className="size-3.5 stroke-[1.5] motion-safe:animate-spin" />
          Salvataggio…
        </>
      ) : state === "saved" ? (
        <>
          <Check aria-hidden className="size-3.5 stroke-[1.5]" />
          Salvato
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-danger">
          <TriangleAlert aria-hidden className="size-3.5 stroke-[1.5]" />
          Errore di salvataggio
        </span>
      )}
    </p>
  );
}
