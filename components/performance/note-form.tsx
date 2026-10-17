"use client";

import * as React from "react";
import { savePerformanceNote } from "@/app/(app)/performance/actions";
import { Button } from "@/components/ui/button";
import { FormMessage, Textarea } from "@/components/ui/form";
import { Label } from "@/components/ui/input";

/** Spazio facoltativo "La tua nota" sotto un obiettivo. */
export function NoteForm({ goalId, initial }: { goalId: string; initial: string | null }) {
  const [note, setNote] = React.useState(initial ?? "");
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const id = `nota-${goalId}`;
  const changed = note.trim() !== (initial ?? "").trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => setResult(await savePerformanceNote({ goalId, note })));
      }}
      className="flex flex-col gap-2"
    >
      <Label htmlFor={id}>La tua nota</Label>
      <Textarea
        id={id}
        value={note}
        maxLength={2000}
        placeholder="Facoltativa: rispondi o racconta come sta andando."
        className="min-h-20"
        onChange={(e) => {
          setNote(e.target.value);
          setResult(null);
        }}
      />
      <div className="flex items-center justify-end gap-3">
        <FormMessage result={result} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending || !changed}>
          Salva nota
        </Button>
      </div>
    </form>
  );
}
