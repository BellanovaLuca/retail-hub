"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { unreadNotificationsCount } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Campanella con contatore in tempo reale (Supabase Realtime, con ripiego a intervalli). */
export function NotificationBell({
  profileId,
  initialCount,
  className,
}: {
  profileId: string;
  initialCount: number;
  className?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const pathname = usePathname();

  useEffect(() => setCount(initialCount), [initialCount]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => unreadNotificationsCount().then((n) => !cancelled && setCount(n));
    const timer = setInterval(refresh, 60_000);
    let removeChannel: (() => void) | undefined;
    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`notifiche:${profileId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `profile_id=eq.${profileId}`,
          },
          refresh,
        )
        .subscribe();
      removeChannel = () => void supabase.removeChannel(channel);
    } catch {
      // Realtime non disponibile: resta il controllo periodico.
    }
    return () => {
      cancelled = true;
      clearInterval(timer);
      removeChannel?.();
    };
  }, [profileId]);

  useEffect(() => {
    if (pathname === "/notifiche") unreadNotificationsCount().then(setCount);
  }, [pathname]);

  return (
    <Link
      href="/notifiche"
      aria-label={count ? `Notifiche: ${count} da leggere` : "Notifiche"}
      className={cn(
        "relative grid size-11 place-items-center rounded-md hover:bg-surface",
        className,
      )}
    >
      <Bell className="size-5 stroke-[1.5]" aria-hidden />
      {count > 0 ? (
        <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-foreground px-1 text-[0.625rem] leading-4 font-medium text-background nums">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
