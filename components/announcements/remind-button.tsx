"use client";

import { BellRing } from "lucide-react";
import { useState, useTransition } from "react";
import { remindUnread } from "@/app/admin/comunicazioni/actions";
import { Button } from "@/components/ui/button";

/** "Sollecita": notifica in-app e push a chi non ha letto (o confermato). */
export function RemindButton({
  announcementId,
  pending,
}: {
  announcementId: string;
  pending: number;
}) {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [busy, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy || pending === 0}
        onClick={() =>
          startTransition(async () => {
            setResult(await remindUnread(announcementId));
          })
        }
      >
        <BellRing aria-hidden /> {busy ? "Invio…" : "Sollecita"}
      </Button>
      {result?.message ? (
        <span role="status" className={result.ok ? "text-xs text-success" : "text-xs text-danger"}>
          {result.message}
        </span>
      ) : null}
    </span>
  );
}
