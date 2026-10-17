"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { respondToSwap } from "./actions";

export function SwapResponse({ id }: { id: string }) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  function respond(accept: boolean) {
    startTransition(async () => {
      setResult(await respondToSwap(id, accept));
      router.refresh();
    });
  }
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => respond(false)}>
          Rifiuta
        </Button>
        <Button disabled={pending} onClick={() => respond(true)}>
          Accetta
        </Button>
      </div>
      <FormMessage result={result} />
    </div>
  );
}
