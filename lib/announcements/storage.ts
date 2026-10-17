import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attachment } from "./model";

export const ATTACHMENTS_BUCKET = "attachments";
const SIGNED_URL_SECONDS = 60 * 60;

export type SignedAttachment = Attachment & { url: string | null };

/**
 * Link firmati (1 ora) per gli allegati. Chi chiama deve aver già verificato, con il client
 * dell'utente e quindi con RLS, che la persona possa vedere la comunicazione o l'attività:
 * il bucket è privato e i dipendenti non lo leggono direttamente.
 *
 * Se lo Storage non risponde (es. stack locale senza Storage) gli allegati restano elencati
 * con `url: null` e la pagina mostra "non disponibile".
 */
export async function signAttachments(attachments: Attachment[]): Promise<SignedAttachment[]> {
  if (attachments.length === 0) return [];
  try {
    const { data, error } = await createAdminClient()
      .storage.from(ATTACHMENTS_BUCKET)
      .createSignedUrls(
        attachments.map((a) => a.path),
        SIGNED_URL_SECONDS,
        { download: false },
      );
    if (error || !data) return attachments.map((a) => ({ ...a, url: null }));
    const byPath = new Map(data.map((d) => [d.path, d.error ? null : d.signedUrl]));
    return attachments.map((a) => ({ ...a, url: byPath.get(a.path) ?? null }));
  } catch {
    return attachments.map((a) => ({ ...a, url: null }));
  }
}

/** Elimina i file non più referenziati. Gli errori non bloccano l'operazione. */
export async function removeAttachmentFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await createAdminClient().storage.from(ATTACHMENTS_BUCKET).remove(paths);
  } catch (error) {
    console.error("allegati: rimozione non riuscita", error);
  }
}
