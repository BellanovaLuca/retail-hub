"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsRead();
          router.refresh();
        })
      }
    >
      Segna tutte come lette
    </Button>
  );
}

export function NotificationLink({
  id,
  href,
  unread,
  children,
}: {
  id: string;
  href: string | null;
  unread: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="block w-full px-1 py-4 text-left hover:bg-surface"
      onClick={() =>
        startTransition(async () => {
          if (unread) await markNotificationRead(id);
          if (href && href.startsWith("/")) router.push(href);
          else router.refresh();
        })
      }
    >
      {children}
    </button>
  );
}
