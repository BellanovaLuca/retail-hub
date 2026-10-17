import { formatDistanceToNow, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { MarkAllRead, NotificationLink } from "./notification-actions";

export const metadata: Metadata = { title: "Notifiche" };

export default async function NotifichePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const list = data ?? [];
  const unread = list.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader eyebrow="Avvisi" title="Notifiche">
        {unread ? `${unread} da leggere` : "Tutto letto"}
      </PageHeader>
      {unread ? (
        <div className="mb-6">
          <MarkAllRead />
        </div>
      ) : null}
      {list.length === 0 ? (
        <EmptyState title="Nessuna notifica, per ora." />
      ) : (
        <ul className="border-t border-line">
          {list.map((n) => (
            <li key={n.id} className={cn("border-b border-line", !n.read_at && "bg-surface/60")}>
              <NotificationLink id={n.id} href={n.link ?? null} unread={!n.read_at}>
                <span className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-2 size-1.5 shrink-0 rounded-full",
                      n.read_at ? "bg-transparent" : "bg-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", !n.read_at && "font-medium")}>{n.title}</span>
                    {n.body ? (
                      <span className="block text-sm whitespace-pre-line text-muted">{n.body}</span>
                    ) : null}
                    <span className="mt-1 block text-xs text-subtle">
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true, locale: it })}
                    </span>
                  </span>
                </span>
              </NotificationLink>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-muted">
        Scegli come ricevere le notifiche dal{" "}
        <Link href="/profilo" className="link-underline">
          profilo
        </Link>
        .
      </p>
    </>
  );
}
