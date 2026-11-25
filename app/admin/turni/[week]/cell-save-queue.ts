/**
 * Coda di salvataggio delle celle del foglio turni: le celle modificate si accumulano e partono
 * in un solo lotto dopo una breve pausa (digitazione in fila, incolla, riempimento), un lotto
 * alla volta così due modifiche alla stessa cella arrivano nell'ordine giusto.
 *
 * Se il server non è raggiungibile (rete assente, nuova versione del sito) il lotto NON è perso:
 * torna in coda, senza coprire modifiche più recenti alle stesse celle, e viene riprovato da
 * solo; finché resta qualcosa in coda `busy()` è vero e il foglio tiene a schermo i valori scritti.
 */
import type { RestoreRow } from "../day-rows";

export type QueuedCell = {
  profileId: string;
  date: string;
  value: string;
  /** Annulla/Ripeti: la giornata com'era quando la cella mostrava questo testo (vedi cell-restore). */
  restore?: RestoreRow[];
};

export type CellSaveHandlers = {
  save: (batch: QueuedCell[]) => Promise<{ ok: boolean; message?: string }>;
  onState: (state: "saving" | "saved" | "error", message: string | null) => void;
  /** Coda vuota e salvataggi finiti: è il momento di ricaricare i dati dal server. */
  onSettled: () => void;
};

export const FLUSH_DELAY_MS = 300;
/** Al massimo 2000 celle per chiamata (il limite dell'azione). */
export const MAX_BATCH = 2000;
export const RETRY_DELAY_MS = 5000;
export const UNREACHABLE_MESSAGE =
  "Salvataggio non riuscito: controlla la connessione. Le modifiche restano nel foglio e vengono riprovate.";

const keyOf = (c: QueuedCell) => `${c.profileId}|${c.date}`;

export function createCellSaveQueue(handlers: () => CellSaveHandlers) {
  const queue = new Map<string, QueuedCell>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight = 0;
  let failed: string | null = null;
  let disposed = false;

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, ms);
  };

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (inflight > 0 || queue.size === 0) return;
    const batch = [...queue.values()].slice(0, MAX_BATCH);
    for (const c of batch) queue.delete(keyOf(c));
    inflight += 1;
    void (async () => {
      let unreachable = false;
      try {
        const res = await handlers().save(batch);
        if (!res.ok) failed = res.message ?? "Salvataggio non riuscito.";
      } catch {
        unreachable = true;
      } finally {
        inflight -= 1;
      }
      if (unreachable) {
        for (const c of batch) if (!queue.has(keyOf(c))) queue.set(keyOf(c), c);
        handlers().onState("error", UNREACHABLE_MESSAGE);
        if (!disposed) schedule(RETRY_DELAY_MS);
        return;
      }
      if (queue.size > 0) {
        flush();
        return;
      }
      handlers().onState(failed ? "error" : "saved", failed);
      failed = null;
      handlers().onSettled();
    })();
  }

  return {
    /** Mette in coda le celle (l'ultima modifica di una cella vince) e fa partire il conto. */
    enqueue(cells: QueuedCell[]) {
      for (const c of cells) queue.set(keyOf(c), c);
      handlers().onState("saving", null);
      schedule(FLUSH_DELAY_MS);
    },
    /** Salvataggi in coda o in corso. */
    busy: () => inflight > 0 || queue.size > 0,
    /** Smontando l'editor la coda parte subito, senza altri tentativi automatici. */
    dispose() {
      disposed = true;
      if (timer) flush();
    },
    /** Rimontaggio (StrictMode): la coda torna a riprovare da sola. */
    revive() {
      disposed = false;
    },
  };
}
