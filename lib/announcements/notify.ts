import "server-only";
import { getPeopleDirectory, recipientsOf } from "@/lib/data/announcements";
import { notify } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import { categoryLabels } from "./model";

type AnnouncementRow = Tables<"announcements">;

function notificationFor(a: AnnouncementRow) {
  const prefix = a.category === "urgente" ? "Urgente: " : a.requires_ack ? "Da confermare: " : "";
  return {
    kind: "announcement" as const,
    title: `${prefix}${a.title}`,
    body: a.requires_ack
      ? "Leggi la comunicazione e conferma con «Ho letto»."
      : `Nuova comunicazione · ${categoryLabels[a.category]}`,
    link: `/comunicazioni/${a.id}`,
  };
}

/**
 * Notifica i destinatari di una comunicazione già pubblicata, una volta sola: segna
 * `notified_at` in modo condizionato, così due chiamate concorrenti non notificano due volte.
 * Restituisce il numero di persone notificate (0 se era già stata notificata o non è ancora
 * il momento).
 */
export async function notifyAnnouncement(id: string): Promise<number> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: claimed } = await db
    .from("announcements")
    .update({ notified_at: nowIso })
    .eq("id", id)
    .is("notified_at", null)
    .lte("publish_at", nowIso)
    .select("*");
  const a = claimed?.[0];
  if (!a) return 0;
  if (a.expires_at && a.expires_at <= nowIso) return 0;

  const people = await getPeopleDirectory(db);
  const ids = recipientsOf(a, people).map((p) => p.id);
  await notify(ids, notificationFor(a));
  return ids.length;
}

/**
 * Per il cron: notifica le comunicazioni programmate arrivate al momento della pubblicazione
 * e non ancora notificate. Restituisce quante comunicazioni ha notificato.
 */
export async function sendDueAnnouncementNotifications(): Promise<{
  announcements: number;
  recipients: number;
}> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: due } = await db
    .from("announcements")
    .select("id")
    .is("notified_at", null)
    .lte("publish_at", nowIso)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("publish_at");
  let announcements = 0;
  let recipients = 0;
  for (const { id } of due ?? []) {
    const n = await notifyAnnouncement(id);
    if (n > 0) announcements += 1;
    recipients += n;
  }
  return { announcements, recipients };
}

/**
 * "Sollecita": promemoria a chi non l'ha ancora letta (o, se richiede conferma, a chi non
 * ha ancora confermato). Restituisce il numero di persone sollecitate.
 */
export async function remindAnnouncement(id: string): Promise<number> {
  const db = createAdminClient();
  const { data: a } = await db.from("announcements").select("*").eq("id", id).maybeSingle();
  if (!a) return 0;
  const [people, { data: reads }] = await Promise.all([
    getPeopleDirectory(db),
    db.from("announcement_reads").select("profile_id, acknowledged_at").eq("announcement_id", id),
  ]);
  const readMap = new Map((reads ?? []).map((r) => [r.profile_id, r]));
  const pending = recipientsOf(a, people)
    .filter((p) => {
      const r = readMap.get(p.id);
      return !r || (a.requires_ack && !r.acknowledged_at);
    })
    .map((p) => p.id);
  await notify(pending, {
    kind: "announcement",
    title: `Promemoria: ${a.title}`,
    body: a.requires_ack
      ? "Non hai ancora confermato la lettura di questa comunicazione."
      : "Non hai ancora letto questa comunicazione.",
    link: `/comunicazioni/${a.id}`,
  });
  return pending.length;
}
