import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type DeliveryPayload = { kind: string; title: string; body?: string; link?: string };
export type NotificationPrefs = { push: boolean; email: boolean; shift_reminder: boolean };

export const DEFAULT_PREFS: NotificationPrefs = { push: true, email: false, shift_reminder: false };

export function parsePrefs(raw: unknown): NotificationPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<NotificationPrefs>;
  return {
    push: p.push ?? DEFAULT_PREFS.push,
    email: p.email ?? DEFAULT_PREFS.email,
    shift_reminder: p.shift_reminder ?? DEFAULT_PREFS.shift_reminder,
  };
}

let vapidReady: boolean | null = null;
function ensureVapid() {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (vapidReady = false);
  webpush.setVapidDetails(`mailto:${process.env.EMAIL_FROM ?? "staff@example.com"}`, pub, priv);
  return (vapidReady = true);
}

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Invia una notifica push a tutti i dispositivi registrati delle persone (che non l'hanno disattivata). */
export async function sendPush(profileIds: string[], payload: DeliveryPayload) {
  if (!ensureVapid() || profileIds.length === 0) return { sent: 0 };
  const db = createAdminClient();
  const [{ data: subs }, { data: profiles }] = await Promise.all([
    db
      .from("push_subscriptions")
      .select("id, profile_id, endpoint, keys")
      .in("profile_id", profileIds),
    db.from("profiles").select("id, notification_prefs, active").in("id", profileIds),
  ]);
  const allowed = new Set(
    (profiles ?? [])
      .filter((p) => p.active && parsePrefs(p.notification_prefs).push)
      .map((p) => p.id),
  );
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.link ?? "/",
    tag: payload.kind,
  });
  let sent = 0;
  await Promise.all(
    (subs ?? [])
      .filter((s) => allowed.has(s.profile_id))
      .map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
            body,
            { TTL: 60 * 60 * 12, urgency: payload.kind === "daily_reminder" ? "normal" : "high" },
          );
          sent++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // Sottoscrizione scaduta o revocata dal browser: si elimina.
          if (status === 404 || status === 410)
            await db.from("push_subscriptions").delete().eq("id", s.id);
          else console.error("push", status, (error as Error).message);
        }
      }),
  );
  return { sent };
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Email facoltativa tramite Resend, solo a chi ha inserito un'email e l'ha attivata (§10). */
export async function sendEmail(profileIds: string[], payload: DeliveryPayload) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || profileIds.length === 0) return { sent: 0 };
  const { data: profiles } = await createAdminClient()
    .from("profiles")
    .select("email, notification_prefs, active, display_name")
    .in("id", profileIds);
  const recipients = (profiles ?? []).filter(
    (p) => p.active && p.email && parsePrefs(p.notification_prefs).email,
  );
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let sent = 0;
  for (const p of recipients) {
    const url = payload.link ? `${base}${payload.link}` : base;
    const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0a0a0a;max-width:480px">
<p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase">Salmoiraghi &amp; Viganò · Cordusio</p>
<h1 style="font-weight:300;font-size:24px">${escapeHtml(payload.title)}</h1>
<p style="white-space:pre-line;line-height:1.5">${escapeHtml(payload.body ?? "")}</p>
${url ? `<p><a href="${escapeHtml(url)}" style="color:#0a0a0a">Apri il portale</a></p>` : ""}
<p style="font-size:12px;color:#57534e">Puoi disattivare le email dal tuo profilo.</p></div>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: p.email,
          subject: payload.title,
          html,
          text: `${payload.title}\n\n${payload.body ?? ""}\n\n${url}`,
        }),
      });
      if (res.ok) sent++;
      else console.error("email", res.status, await res.text());
    } catch (error) {
      console.error("email", error);
    }
  }
  return { sent };
}
