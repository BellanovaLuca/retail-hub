"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/form";
import { Label } from "@/components/ui/input";
import { SaveIndicator, type SaveStatus } from "./save-indicator";

/**
 * Campo di testo con salvataggio automatico (debounce), es. "La mia nota" o il commento
 * generale della settimana. `onSave` restituisce l'esito della Server Action.
 */
export function AutoSaveTextarea({
  label,
  initialValue,
  onSave,
  placeholder,
  hint,
  delay = 800,
  rows = 4,
  id,
}: {
  label: string;
  initialValue: string;
  onSave: (value: string) => Promise<{ ok: boolean; message?: string }>;
  placeholder?: string;
  hint?: React.ReactNode;
  delay?: number;
  rows?: number;
  id?: string;
}) {
  const fallbackId = React.useId();
  const fieldId = id ?? fallbackId;
  const [value, setValue] = React.useState(initialValue);
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef(initialValue);
  const saved = React.useRef(initialValue);
  const saveRef = React.useRef(onSave);
  React.useEffect(() => {
    saveRef.current = onSave;
  });

  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = latest.current;
    if (text === saved.current) return;
    setStatus("saving");
    const res = await saveRef.current(text);
    if (res.ok) {
      saved.current = text;
      setStatus(latest.current === text ? "saved" : "pending");
      setError(null);
    } else {
      setStatus("error");
      setError(res.message ?? "Non salvato");
    }
  }, []);

  // Salva quello che resta quando si lascia la pagina.
  React.useEffect(() => () => void flush(), [flush]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={fieldId}>{label}</Label>
        <SaveIndicator status={status} error={error} />
      </div>
      <Textarea
        id={fieldId}
        value={value}
        rows={rows}
        placeholder={placeholder}
        maxLength={4000}
        onChange={(e) => {
          setValue(e.target.value);
          latest.current = e.target.value;
          setStatus("pending");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), delay);
        }}
        onBlur={() => void flush()}
      />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
