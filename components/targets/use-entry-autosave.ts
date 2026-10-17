"use client";

import * as React from "react";
import type { SaveStatus } from "./save-indicator";

export type EntryChange = { kpiId: string; date: string; value: number | null };

const k = (kpiId: string, date: string) => `${kpiId}|${date}`;

/**
 * Numeri giornalieri con aggiornamento ottimistico e salvataggio automatico a lotti
 * (debounce ~600 ms): ogni tocco aggiorna subito lo schermo, il server riceve un'unica chiamata.
 * In caso di errore i valori tornano all'ultimo stato salvato.
 */
export function useEntryAutosave(
  initial: Record<string, number | null>,
  save: (changes: EntryChange[]) => Promise<{ ok: boolean; message?: string }>,
  delay = 600,
) {
  const [values, setValues] = React.useState(initial);
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const queue = React.useRef(new Map<string, EntryChange>());
  const confirmed = React.useRef(initial);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef<Promise<void> | null>(null);
  // La funzione di salvataggio cambia a ogni render: la teniamo in un ref per avere flush stabile.
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });

  const flush = React.useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) await inFlight.current;
    if (queue.current.size === 0) return;
    const batch = [...queue.current.values()];
    queue.current = new Map();
    setStatus("saving");
    const run = (async () => {
      const res = await saveRef.current(batch);
      if (res.ok) {
        const next = { ...confirmed.current };
        for (const c of batch) next[k(c.kpiId, c.date)] = c.value;
        confirmed.current = next;
        setError(null);
        setStatus(queue.current.size ? "pending" : "saved");
      } else {
        // Torna ai valori salvati per le celle non accettate (es. giorno fuori finestra).
        setValues((prev) => {
          const next = { ...prev };
          for (const c of batch) {
            if (!queue.current.has(k(c.kpiId, c.date)))
              next[k(c.kpiId, c.date)] = confirmed.current[k(c.kpiId, c.date)] ?? null;
          }
          return next;
        });
        setError(res.message ?? "Non salvato");
        setStatus("error");
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, []);

  const update = React.useCallback(
    (changes: EntryChange[]) => {
      if (changes.length === 0) return;
      setValues((prev) => {
        const next = { ...prev };
        for (const c of changes) next[k(c.kpiId, c.date)] = c.value;
        return next;
      });
      for (const c of changes) queue.current.set(k(c.kpiId, c.date), c);
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  // Non perdere l'ultimo tocco se si cambia pagina prima del debounce.
  React.useEffect(() => () => void flush(), [flush]);

  const get = React.useCallback(
    (kpiId: string, date: string) => values[k(kpiId, date)] ?? null,
    [values],
  );

  return { values, get, update, flush, status, error };
}

export const entryKey = k;
