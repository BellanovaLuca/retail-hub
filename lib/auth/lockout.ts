/** Tentativi errati consecutivi ammessi per codice prima del blocco. */
export const MAX_FAILED_PER_CODE = 5;
/**
 * Soglia per indirizzo IP. È più alta di quella per codice perché tutto il
 * negozio può uscire dallo stesso IP (wifi del negozio).
 */
export const MAX_FAILED_PER_IP = 20;
export const LOCKOUT_MINUTES = 15;

export type LoginAttempt = { at: Date; success: boolean };

/**
 * Conta i tentativi errati nella finestra di blocco, ripartendo da zero dopo
 * l'ultimo accesso riuscito. Restituisce fino a quando l'accesso è bloccato,
 * oppure null.
 */
export function lockedUntil(
  attempts: LoginAttempt[],
  maxFailed: number,
  now: Date = new Date(),
): Date | null {
  const windowStart = now.getTime() - LOCKOUT_MINUTES * 60_000;
  const recent = attempts
    .filter((a) => a.at.getTime() > windowStart)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const lastSuccess = recent.findLastIndex((a) => a.success);
  const failures = recent.slice(lastSuccess + 1);
  if (failures.length < maxFailed) return null;

  const trigger = failures[failures.length - maxFailed];
  return new Date(trigger.at.getTime() + LOCKOUT_MINUTES * 60_000);
}
