"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Textarea } from "@/components/ui/form";
import { addRequestComment } from "@/app/(app)/richieste/actions";

export function CommentForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await addRequestComment(requestId, body);
          setResult(res.ok ? null : res);
          if (res.ok) {
            setBody("");
            router.refresh();
          }
        });
      }}
    >
      <Textarea
        aria-label="Commento"
        placeholder="Scrivi un commento…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="min-h-20"
      />
      <div className="flex items-center justify-end gap-3">
        <FormMessage result={result} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending || !body.trim()}>
          Invia commento
        </Button>
      </div>
    </form>
  );
}
