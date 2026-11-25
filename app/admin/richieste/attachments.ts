/**
 * Allegati da eliminare insieme alle richieste: solo i percorsi dentro la cartella di chi ha
 * fatto la richiesta (`<profile_id>/…`). `requests.attachment_path` lo scrive il dipendente e la
 * rimozione avviene con il service role: un percorso qualsiasi (l'allegato di una comunicazione,
 * il file di un collega) non va mai preso per buono.
 */
export function ownAttachmentPaths(
  rows: { profile_id: string; attachment_path: string | null }[],
): string[] {
  return rows.flatMap((r) => {
    const path = r.attachment_path;
    if (!path || !path.startsWith(`${r.profile_id}/`)) return [];
    // Niente risalite di cartella né segmenti vuoti.
    if (path.split("/").some((part) => part === "" || part === "." || part === "..")) return [];
    return [path];
  });
}
