"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acknowledgeAnnouncement } from "@/lib/announcements/actions";

const formatAck = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** "Ho letto": conferma di lettura per le comunicazioni che la richiedono. */
export function AckButton({
  announcementId,
  acknowledgedAt,
}: {
  announcementId: string;
  acknowledgedAt: string | null;
}) {
  const [done, setDone] = useState<string | null>(acknowledgedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-success">
        <Check className="size-4 stroke-[1.5]" aria-hidden />
        Lettura confermata il {formatAck(done)}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-warning">Questa comunicazione richiede una conferma di lettura.</p>
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acknowledgeAnnouncement(announcementId);
            if (result.ok) setDone(new Date().toISOString());
            else setError(result.message);
          })
        }
      >
        <Check aria-hidden /> {pending ? "Invio…" : "Ho letto"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
