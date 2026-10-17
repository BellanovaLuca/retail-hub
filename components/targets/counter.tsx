"use client";

import { Minus, Plus } from "lucide-react";
import * as React from "react";
import { formatCount, parseCount } from "@/lib/kpi/sheet";
import { cn } from "@/lib/utils";

/**
 * Contatore − / + grande per la compilazione da telefono (§6.1): tocchi da 56px, valore centrale
 * tappabile per digitarlo. `value` null = nessun numero ancora inserito (mostrato come 0).
 */
export function Counter({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const current = value ?? 0;

  const commit = () => {
    setEditing(false);
    const parsed = parseCount(draft);
    if (parsed === "invalid") return;
    onChange(parsed ?? 0);
  };

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Togli 1 a ${label}`}
        disabled={disabled || current <= 0}
        onClick={() => onChange(Math.max(0, current - 1))}
        className="grid size-14 shrink-0 touch-manipulation place-items-center rounded-md border border-line-strong text-foreground transition-colors duration-150 select-none active:bg-surface disabled:opacity-30"
      >
        <Minus className="size-6 stroke-[1.5]" aria-hidden />
      </button>
      {editing ? (
        <input
          autoFocus
          inputMode="decimal"
          enterKeyHint="done"
          aria-label={`Valore di ${label}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-14 w-16 rounded-md border border-foreground bg-transparent text-center font-display text-2xl nums outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${formatCount(current)}. Tocca per scrivere il numero`}
          onClick={() => {
            setDraft(value === null ? "" : formatCount(value));
            setEditing(true);
          }}
          className={cn(
            "h-14 w-16 shrink-0 touch-manipulation rounded-md font-display text-3xl font-light nums",
            value === null ? "text-subtle" : "text-foreground",
            "disabled:opacity-40",
          )}
        >
          {formatCount(current)}
        </button>
      )}
      <button
        type="button"
        aria-label={`Aggiungi 1 a ${label}`}
        disabled={disabled}
        onClick={() => onChange(current + 1)}
        className="grid size-14 shrink-0 touch-manipulation place-items-center rounded-md bg-foreground text-background transition-opacity duration-150 select-none active:opacity-80 disabled:opacity-30"
      >
        <Plus className="size-6 stroke-[1.5]" aria-hidden />
      </button>
    </div>
  );
}
