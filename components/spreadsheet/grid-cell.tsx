"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { CellTone } from "./types";

export const TONE_CLASS: Record<CellTone, string> = {
  default: "",
  muted: "bg-surface text-subtle",
  danger: "bg-danger/8 text-danger",
  warning: "bg-warning/8 text-warning",
  success: "bg-success/8 text-success",
  hatched: "hatch text-line-strong",
  dashed:
    "after:pointer-events-none after:absolute after:inset-1 after:rounded-sm after:border after:border-dashed after:border-warning",
};

export type GridCellProps = {
  r: number;
  c: number;
  rowId: string;
  colId: string;
  rowLabel: string;
  colLabel: string;
  value: string;
  left: number;
  width: number;
  height: number;
  active: boolean;
  selected: boolean;
  readOnly: boolean;
  tone: CellTone;
  title?: string;
  className?: string;
  renderCell?: (rowId: string, colId: string, value: string) => React.ReactNode;
};

/**
 * Una cella della griglia. È memoizzata: con props primitive, spostare la selezione
 * rirenderizza solo le celle il cui stato cambia davvero.
 */
export const GridCell = React.memo(function GridCell({
  r,
  c,
  rowId,
  colId,
  rowLabel,
  colLabel,
  value,
  left,
  width,
  height,
  active,
  selected,
  readOnly,
  tone,
  title,
  className,
  renderCell,
}: GridCellProps) {
  const content = renderCell ? renderCell(rowId, colId, value) : value;
  return (
    <div
      role="gridcell"
      data-cell=""
      data-r={r}
      data-c={c}
      data-row-id={rowId}
      data-col-id={colId}
      aria-colindex={c + 2}
      aria-selected={selected}
      aria-readonly={readOnly || undefined}
      aria-label={`${rowLabel}, ${colLabel}: ${value === "" ? "vuota" : value}`}
      tabIndex={active ? 0 : -1}
      title={title}
      style={{ left, width, height }}
      className={cn(
        "absolute top-0 flex items-center justify-center overflow-hidden border-r border-b border-line px-1.5 text-center whitespace-nowrap",
        className,
        TONE_CLASS[tone],
        active
          ? "z-[6] outline-2 -outline-offset-2 outline-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
          : "focus-visible:outline-none",
      )}
    >
      {tone === "hatched" && value !== "" ? (
        <span className="truncate bg-background px-1 text-muted">{content}</span>
      ) : (
        <span className="truncate">{content}</span>
      )}
    </div>
  );
});
