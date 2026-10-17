"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { PersonDot } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { reorderEmployees } from "./actions";

export type StaffRow = {
  id: string;
  displayName: string;
  fullName: string;
  code: string;
  color: string | null;
  role: "admin" | "employee";
  zone: "vista" | "sole" | "jolly";
  weeklyHours: number | null;
  active: boolean;
  mustChangePin: boolean;
  primaryDepartment: string;
  otherDepartments: string[];
};

const zoneTone = { vista: "vista", sole: "sole", jolly: "neutral" } as const;
const zoneLabel = { vista: "Vista", sole: "Sole", jolly: "Jolly" } as const;

export function StaffList({
  rows: initial,
  sortable = false,
}: {
  rows: StaffRow[];
  sortable?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist(next: StaffRow[]) {
    setRows(next);
    setStatus("Salvataggio…");
    startTransition(async () => {
      const result = await reorderEmployees(next.map((r) => r.id));
      setStatus(result.ok ? "Ordine salvato" : result.message);
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
    const next = rows.filter((r) => r.id !== dragId);
    const dragged = rows.find((r) => r.id === dragId)!;
    next.splice(
      next.findIndex((r) => r.id === targetId),
      0,
      dragged,
    );
    setDragId(null);
    persist(next);
  }

  if (rows.length === 0) {
    return (
      <p className="py-16 font-display text-2xl font-light text-subtle">
        Nessun dipendente ancora. Inizia creando la prima persona.
      </p>
    );
  }

  return (
    <>
      {sortable ? (
        <p aria-live="polite" className="mb-2 h-4 text-xs text-muted">
          {pending ? "Salvataggio…" : status}
        </p>
      ) : null}
      <ol className="border-t border-line">
        {rows.map((row, i) => (
          <li
            key={row.id}
            draggable={sortable}
            onDragStart={() => setDragId(row.id)}
            onDragOver={(e) => sortable && e.preventDefault()}
            onDrop={() => dropOn(row.id)}
            onDragEnd={() => setDragId(null)}
            className={cn(
              "group flex items-center gap-3 border-b border-line py-3",
              dragId === row.id && "opacity-40",
            )}
          >
            {sortable ? (
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
                  aria-label={`Sposta ${row.displayName} più in alto`}
                >
                  <ArrowUp className="size-4 stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  className="grid size-9 place-items-center rounded-sm hover:bg-surface hover:text-foreground disabled:opacity-30"
                  aria-label={`Sposta ${row.displayName} più in basso`}
                >
                  <ArrowDown className="size-4 stroke-[1.5]" />
                </button>
              </span>
            ) : null}
            <Link
              href={`/admin/dipendenti/${row.id}`}
              className="grid min-h-11 flex-1 grid-cols-1 items-center gap-x-6 gap-y-1 sm:grid-cols-[minmax(10rem,1.2fr)_1.4fr_auto_5rem]"
            >
              <span className="flex items-center gap-2.5">
                <PersonDot color={row.color} />
                <span className="font-medium">{row.displayName}</span>
                <span className="text-xs text-muted nums">{row.code}</span>
              </span>
              <span className="text-sm text-muted">
                {row.fullName} · <span className="text-foreground">{row.primaryDepartment}</span>
                {row.otherDepartments.length > 0 ? ` + ${row.otherDepartments.join(", ")}` : ""}
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Badge tone={zoneTone[row.zone]}>{zoneLabel[row.zone]}</Badge>
                {row.role === "admin" ? <Badge tone="solid">Admin</Badge> : null}
                {row.mustChangePin && row.active ? (
                  <Badge tone="warning">PIN provvisorio</Badge>
                ) : null}
              </span>
              <span className="text-sm nums sm:text-right">
                {row.weeklyHours != null ? `${row.weeklyHours.toLocaleString("it-IT")} h` : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
