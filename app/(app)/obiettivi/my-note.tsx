"use client";

import { AutoSaveTextarea } from "@/components/targets/auto-save-textarea";
import { saveMyNote } from "./actions";

/** "La mia nota": risposta o racconto della settimana, salvata in automatico. */
export function MyNote({ weekStart, initialValue }: { weekStart: string; initialValue: string }) {
  return (
    <AutoSaveTextarea
      label="Racconta la settimana o rispondi ai commenti"
      initialValue={initialValue}
      placeholder="Scrivi qui…"
      hint="La leggono i responsabili."
      onSave={(body) => saveMyNote({ weekStart, body })}
    />
  );
}
