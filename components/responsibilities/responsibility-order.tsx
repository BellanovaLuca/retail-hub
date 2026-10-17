"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { reorderResponsibilities } from "@/app/admin/comunicazioni/responsabilita/actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DayLetters } from "./day-letters";

export type OrderRow = {
  id: string;
  title: string;
  active: boolean;
  allStaff: boolean;
  scheduleDays: number[];
  ownerName: string | null;
  supportNames: string[];
};

/** Elenco delle attività riordinabile trascinando (o con le frecce, da tastiera e telefono). */
export function ResponsibilityOrder({ rows: initial }: { rows: OrderRow[] }) {
  const [rows, setRows] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist(next: OrderRow[]) {
    setRows(next);
    startTransition(async () => {
      const res = await reorderResponsibilities(next.map((r) => r.id));
      setStatus(res.ok ? "Ordine salvato" : res.message);
      if (!res.ok) setRows(rows);
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const dragged = rows.find((r) => r.id === dragId)!;
    const next = rows.filter((r) => r.id !== dragId);
    next.splice(
      next.findIndex((r) => r.id === targetId),
      0,
      dragged,
    );
    setDragId(null);
    persist(next);
  }

  return (
    <>
      <p aria-live="polite" className="mb-2 h-4 text-xs text-muted">
        {pending ? "Salvataggio…" : status}
      </p>
      <ol className="border-t border-line">
        {rows.map((row, i) => (
          <li
            key={row.id}
            draggable
            onDragStart={() => setDragId(row.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(row.id)}
            onDragEnd={() => setDragId(null)}
            className={cn(
              "flex items-center gap-3 border-b border-line py-2",
              dragId === row.id && "opacity-40",
              !row.active && "text-muted",
            )}
          >
            <span className="flex items-center gap-0.5 text-subtle">
              <GripVertical
                className="hidden size-4 cursor-grab stroke-[1.5] sm:block"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="grid size-9 place-items-center rounded-sm hover:bg-surface hover:text-foreground disabled:opacity-30"
                aria-label={`Sposta ${row.title} più in alto`}
              >
                <ArrowUp className="size-4 stroke-[1.5]" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                className="grid size-9 place-items-center rounded-sm hover:bg-surface hover:text-foreground disabled:opacity-30"
                aria-label={`Sposta ${row.title} più in basso`}
              >
                <ArrowDown className="size-4 stroke-[1.5]" />
              </button>
            </span>
            <Link
              href={`/admin/comunicazioni/responsabilita/${row.id}`}
              className="grid min-h-11 flex-1 grid-cols-1 items-center gap-x-6 gap-y-1 sm:grid-cols-[minmax(12rem,1.3fr)_1.5fr_auto]"
            >
              <span className="flex items-center gap-2 font-medium">
                {row.title}
                {!row.active ? <Badge>Disattivata</Badge> : null}
              </span>
              <span className="text-sm text-muted">
                {row.allStaff ? (
                  <strong className="font-semibold text-foreground">Tutti</strong>
                ) : row.ownerName ? (
                  <strong className="font-semibold text-foreground">{row.ownerName}</strong>
                ) : (
                  <span className="text-warning">Senza responsabile</span>
                )}
                {row.supportNames.length > 0 ? ` · ${row.supportNames.join(", ")}` : ""}
              </span>
              <DayLetters days={row.scheduleDays} />
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
