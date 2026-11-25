/** Stato delle esecuzioni dei job pianificati (cron_runs). Logica pura. */

/** Dopo quanti minuti un'esecuzione ancora «in corso» si considera interrotta (timeout). */
export const STALE_RUN_MINUTES = 10;
/** Tentativi massimi per chiave: un job che continua a fallire non riparte all'infinito. */
export const MAX_RUN_ATTEMPTS = 3;

export type RunRecord = { status: string; attempts: number; ran_at: string };

/**
 * Cosa fare quando per la chiave esiste già un'esecuzione:
 *  - "done": già eseguito;
 *  - "busy": in corso da poco (un'altra chiamata lo sta eseguendo);
 *  - "exhausted": fallito troppe volte;
 *  - "retry": fallito, oppure «in corso» da troppo tempo (funzione interrotta): si riprova.
 */
export function existingRunDecision(
  run: RunRecord,
  now: Date = new Date(),
): "done" | "busy" | "exhausted" | "retry" {
  if (run.status === "done") return "done";
  const stale = now.getTime() - new Date(run.ran_at).getTime() > STALE_RUN_MINUTES * 60_000;
  if (run.status === "running" && !stale) return "busy";
  if (run.attempts >= MAX_RUN_ATTEMPTS) return "exhausted";
  return "retry";
}
