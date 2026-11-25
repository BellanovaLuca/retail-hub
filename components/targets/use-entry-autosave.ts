"use client";

import * as React from "react";
import type { SaveStatus } from "./save-indicator";

export type EntryChange = { kpiId: string; date: string; value: number | null };

const k = (kpiId: string, date: string) => `${kpiId}|${date}`;

const NETWORK_ERROR = "Non salvato: controlla la connessione. Riprovo tra poco.";
/** Dopo un errore di rete il lotto rimasto in coda si riprova da solo. */
const RETRY_DELAY_MS = 5000;

/**
 * Numeri giornalieri con aggiornamento ottimistico e salvataggio automatico a lotti
 * (debounce ~600 ms): ogni tocco aggiorna subito lo schermo, il server riceve un'unica chiamata.
 * Se il server rifiuta il lotto i valori tornano all'ultimo stato salvato; se il server non è
 * raggiungibile restano a schermo, lo stato diventa «errore» e il lotto viene riprovato.
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
  const unmounted = React.useRef(false);
  const flushRef = React.useRef<() => Promise<void>>(async () => {});
  // La funzione di salvataggio cambia a ogni render: la teniamo in un ref per avere flush stabile.
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });

  const flush = React.useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // Un salvataggio alla volta: quello in corso non lancia mai (gli errori sono gestiti sotto).
    if (inFlight.current) await inFlight.current;
    if (queue.current.size === 0) return;
    const batch = [...queue.current.values()];
    queue.current = new Map();
    setStatus("saving");
    const run = (async () => {
      let res: { ok: boolean; message?: string };
      let unreachable = false;
      try {
        res = await saveRef.current(batch);
      } catch {
        // Server non raggiungibile (rete assente, nuova versione del sito): il lotto non è perso.
        unreachable = true;
        res = { ok: false, message: NETWORK_ERROR };
      }
      if (res.ok) {
        const next = { ...confirmed.current };
        for (const c of batch) next[k(c.kpiId, c.date)] = c.value;
        confirmed.current = next;
        setError(null);
        setStatus(queue.current.size ? "pending" : "saved");
      } else if (unreachable) {
        // I numeri restano a schermo e tornano in coda (senza coprire tocchi più recenti):
        // si riprova da soli tra poco e comunque al prossimo tocco.
        for (const c of batch) {
          if (!queue.current.has(k(c.kpiId, c.date))) queue.current.set(k(c.kpiId, c.date), c);
        }
        setError(res.message ?? NETWORK_ERROR);
        setStatus("error");
        if (!timer.current && !unmounted.current) {
          timer.current = setTimeout(() => void flushRef.current(), RETRY_DELAY_MS);
        }
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
    try {
      await run;
    } finally {
      if (inFlight.current === run) inFlight.current = null;
    }
  }, []);
  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

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
  React.useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      void flush();
    };
  }, [flush]);

  const get = React.useCallback(
    (kpiId: string, date: string) => values[k(kpiId, date)] ?? null,
    [values],
  );

  return { values, get, update, flush, status, error };
}

export const entryKey = k;
