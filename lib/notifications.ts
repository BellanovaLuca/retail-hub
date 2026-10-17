import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationKind =
  | "week_published"
  | "shift_changed"
  | "request_new"
  | "request_decided"
  | "swap_proposed"
  | "announcement"
  | "performance_published"
  | "targets_assigned"
  | "week_comments"
  | "daily_reminder"
  | "responsibility_today"
  | "responsibility_missed"
  | "assignment_new"
  | "shift_reminder"
  | "week_unpublished_warning"
  | "responsibility_uncovered";

export type NotificationInput = {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
};

export type Channel = "in_app" | "push" | "email";

/** Canali per tipo di evento (§10). L'email vale solo per chi l'ha inserita e attivata. */
const CHANNELS: Record<NotificationKind, Channel[]> = {
  week_published: ["in_app", "push", "email"],
  shift_changed: ["in_app", "push", "email"],
  request_new: ["in_app", "push"],
  request_decided: ["in_app", "push", "email"],
  swap_proposed: ["in_app", "push"],
  announcement: ["in_app", "push"],
  performance_published: ["in_app"],
  targets_assigned: ["in_app", "push"],
  week_comments: ["in_app", "push"],
  daily_reminder: ["push"],
  responsibility_today: ["push"],
  responsibility_missed: ["in_app"],
  assignment_new: ["in_app", "push"],
  shift_reminder: ["push"],
  week_unpublished_warning: ["in_app"],
  responsibility_uncovered: ["in_app", "push"],
};

type Deliverer = (profileIds: string[], n: NotificationInput) => Promise<void>;

/** Recapito push/email: registrato dal modulo push (milestone Notifiche). */
let externalDeliverer: Deliverer | null = null;
export function registerDeliverer(fn: Deliverer) {
  externalDeliverer = fn;
}

/**
 * Invia la stessa notifica a più persone. Non fa mai fallire l'operazione che la
 * genera: gli errori di recapito finiscono nel log.
 */
export async function notify(profileIds: string[], n: NotificationInput) {
  const ids = [...new Set(profileIds)].filter(Boolean);
  if (ids.length === 0) return;
  const channels = CHANNELS[n.kind];
  try {
    if (channels.includes("in_app")) {
      const { error } = await createAdminClient()
        .from("notifications")
        .insert(
          ids.map((id) => ({
            profile_id: id,
            kind: n.kind,
            title: n.title,
            body: n.body ?? null,
            link: n.link ?? null,
          })),
        );
      if (error) console.error("notifiche in-app", error);
    }
    if (externalDeliverer && (channels.includes("push") || channels.includes("email"))) {
      await externalDeliverer(ids, n);
    }
  } catch (error) {
    console.error("notifiche", error);
  }
}

/** Notifiche diverse per ciascuna persona (es. prima/dopo dei propri turni). */
export async function notifyEach(items: { profileId: string; notification: NotificationInput }[]) {
  await Promise.all(items.map((i) => notify([i.profileId], i.notification)));
}

export function channelsFor(kind: NotificationKind) {
  return CHANNELS[kind];
}

/** Tutti gli admin attivi. */
export async function adminIds(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);
  return (data ?? []).map((p) => p.id);
}
