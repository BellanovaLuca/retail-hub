"use client";

import { BellRing, Check, Megaphone, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { confirmBestPerformer, remindToFill } from "../../actions";

export function BestPerformerActions({
  weekStart,
  profileId,
  confirmed,
  announcementHref,
}: {
  weekStart: string;
  profileId: string;
  confirmed: boolean;
  announcementHref: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {confirmed ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await confirmBestPerformer({ weekStart, profileId: null });
                setResult(res);
                router.refresh();
              })
            }
          >
            <Undo2 aria-hidden /> Annulla conferma
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await confirmBestPerformer({ weekStart, profileId });
                setResult(res);
                router.refresh();
              })
            }
          >
            <Check aria-hidden /> Conferma
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href={announcementHref}>
            <Megaphone aria-hidden /> Citalo in una comunicazione
          </Link>
        </Button>
      </div>
      <FormMessage result={result} />
    </div>
  );
}

export function RemindButton({ profileIds, date }: { profileIds: string[]; date: string }) {
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending || Boolean(result?.ok)}
        onClick={() =>
          start(async () => {
            setResult(await remindToFill({ profileIds, date }));
          })
        }
      >
        <BellRing aria-hidden /> {result?.ok ? "Sollecitati" : "Sollecita"}
      </Button>
      {result && !result.ok ? <FormMessage result={result} /> : null}
      {result?.ok ? <span className="text-xs text-success">{result.message}</span> : null}
    </div>
  );
}
