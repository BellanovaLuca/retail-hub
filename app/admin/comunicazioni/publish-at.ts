/**
 * Data di pubblicazione da salvare. `requested` è la data scelta nell'editor (ISO) oppure null
 * per "subito": una comunicazione già uscita conserva la sua data originale; una nuova, o una
 * programmata non ancora uscita, esce adesso.
 */
export function resolvePublishAt(
  requested: string | null,
  existingPublishAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (requested) return requested;
  if (existingPublishAt && new Date(existingPublishAt) <= now) return existingPublishAt;
  return now.toISOString();
}
