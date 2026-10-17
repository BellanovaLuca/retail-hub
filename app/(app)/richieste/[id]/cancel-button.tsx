"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { cancelRequest } from "../actions";

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (!confirm("Annullare la richiesta?")) return;
          startTransition(async () => {
            setResult(await cancelRequest(id));
            router.refresh();
          });
        }}
      >
        Annulla richiesta
      </Button>
      <FormMessage result={result} />
    </div>
  );
}
