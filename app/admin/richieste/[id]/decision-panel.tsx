"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormMessage, Textarea } from "@/components/ui/form";
import { decideRequests } from "../actions";

const EFFECTS: Record<string, string> = {
  ferie: "Approvando, i giorni finiscono nel planning ferie e nel foglio turni (bloccati).",
  permesso:
    "Approvando, il permesso finisce nel planning e i turni di quei giorni vengono segnalati.",
  giorno_libero: "Approvando, il giorno compare come assenza nel foglio turni.",
  indisponibilita: "Approvando, i giorni indicati compaiono come assenza nel foglio turni.",
  malattia: 'Approvando, i giorni compaiono come assenza (i colleghi vedono solo "Assente").',
  scambio_turno:
    "Approvando, i due turni vengono scambiati subito e, se la settimana è pubblicata, le due giornate vengono ripubblicate e i colleghi avvisati.",
  cambio_turno: "Il cambio va poi fatto a mano nel foglio turni.",
  altro: "",
};

export function DecisionPanel({ id, type }: { id: string; type: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      setResult(await decideRequests([id], decision, note));
      router.refresh();
    });
  }

  return (
    <Card className="border-foreground">
      <CardTitle>Decisione</CardTitle>
      {EFFECTS[type] ? <p className="mb-4 text-sm text-muted">{EFFECTS[type]}</p> : null}
      <Textarea
        aria-label="Nota di decisione"
        placeholder="Nota per il dipendente (facoltativa)"
        className="min-h-16"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <FormMessage result={result} />
        <Button variant="danger" disabled={pending} onClick={() => decide("rejected")}>
          <X aria-hidden /> Rifiuta
        </Button>
        <Button disabled={pending} onClick={() => decide("approved")}>
          <Check aria-hidden /> Approva
        </Button>
      </div>
    </Card>
  );
}
