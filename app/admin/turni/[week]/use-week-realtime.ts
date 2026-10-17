"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Aggiornamento in tempo reale se un altro admin modifica la stessa settimana, e
 * indicatore di chi la sta modificando (Supabase Realtime: postgres_changes + presence).
 * Se Realtime non è disponibile, l'editor funziona comunque.
 */
export function useWeekRealtime(weekId: string, me: { id: string; displayName: string }) {
  const router = useRouter();
  const [others, setOthers] = useState<{ id: string; name: string }[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const channel = supabase.channel(`settimana:${weekId}`, {
      config: { presence: { key: me.id } },
    });

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts", filter: `week_id=eq.${weekId}` },
        () => {
          // Più modifiche ravvicinate (un incolla) → un solo aggiornamento.
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 400);
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id: string; name: string }>();
        const list = Object.values(state)
          .flat()
          .filter((p) => p.id !== me.id);
        setOthers([...new Map(list.map((p) => [p.id, { id: p.id, name: p.name }])).values()]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ id: me.id, name: me.displayName });
      });

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [weekId, me.id, me.displayName, router]);

  return others;
}
