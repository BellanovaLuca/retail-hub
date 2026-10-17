"use client";

import { useEffect, useRef } from "react";
import { markAnnouncementRead } from "@/lib/announcements/actions";

/**
 * All'apertura del dettaglio segna la comunicazione come letta (una volta sola). Sta in un
 * effetto lato client e non nel render del server, così un prefetch del link non la segna.
 */
export function MarkRead({ announcementId }: { announcementId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void markAnnouncementRead(announcementId);
  }, [announcementId]);
  return null;
}
