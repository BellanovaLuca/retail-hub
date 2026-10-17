"use client";

import { KeyRound, Trash2, UserX, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { deleteEmployee, resetPin, setEmployeeActive, type Credentials } from "../actions";
import { CredentialsDialog } from "../credentials-dialog";

type History = { shifts: number; leaves: number; requests: number; entries: number };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Testo della conferma: cosa sparisce con l'account. */
function deleteQuestion(name: string, history: History, everLoggedIn: boolean) {
  const parts = [
    history.shifts ? plural(history.shifts, "turno", "turni") : null,
    history.leaves
      ? plural(history.leaves, "giorno di ferie/assenza", "giorni di ferie/assenza")
      : null,
    history.requests ? plural(history.requests, "richiesta", "richieste") : null,
    history.entries
      ? plural(history.entries, "numero degli obiettivi", "numeri degli obiettivi")
      : null,
  ].filter(Boolean);
  const lines = [`Eliminare definitivamente ${name}? L'operazione non si può annullare.`];
  if (parts.length) lines.push(`Verranno cancellati anche: ${parts.join(", ")}.`);
  if (everLoggedIn || parts.length)
    lines.push('Se ha già lavorato in negozio è meglio "Disattiva account": lo storico resta.');
  return lines.join("\n\n");
}

export function AccountActions({
  id,
  name,
  active,
  isSelf,
  everLoggedIn,
  history,
}: {
  id: string;
  name: string;
  active: boolean;
  isSelf: boolean;
  everLoggedIn: boolean;
  history: History;
}) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onReset() {
    if (
      !confirm(
        "Generare un nuovo PIN provvisorio? Quello attuale smetterà di funzionare e la persona dovrà sceglierne uno nuovo al prossimo accesso.",
      )
    )
      return;
    startTransition(async () => {
      const res = await resetPin(id);
      if (res.ok && res.data) setCredentials(res.data);
      else setResult({ ok: false, message: res.message });
    });
  }

  function onToggleActive() {
    const question = active
      ? "Disattivare l'account? La persona non potrà più accedere; il suo storico resta."
      : "Riattivare l'account?";
    if (!confirm(question)) return;
    startTransition(async () => {
      const res = await setEmployeeActive(id, !active);
      setResult({ ok: res.ok, message: res.message });
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(deleteQuestion(name, history, everLoggedIn))) return;
    startTransition(async () => {
      const res = await deleteEmployee(id);
      if (res.ok) {
        router.replace("/admin/dipendenti");
        router.refresh();
      } else {
        setResult({ ok: false, message: res.message });
      }
    });
  }

  return (
    <Card className="mt-6">
      <CardTitle>Accesso</CardTitle>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {isSelf ? (
          // Sul proprio account "Genera nuovo PIN" crea un PIN provvisorio da cambiare subito:
          // per scegliere un PIN nuovo si passa dal Profilo.
          <p className="text-sm text-muted">
            Per cambiare il tuo PIN vai al{" "}
            <Link href="/profilo" className="text-foreground underline underline-offset-4">
              Profilo
            </Link>
            .
          </p>
        ) : (
          <Button variant="secondary" onClick={onReset} disabled={pending || !active}>
            <KeyRound aria-hidden /> Genera nuovo PIN
          </Button>
        )}
        {!isSelf ? (
          <Button
            variant={active ? "danger" : "secondary"}
            onClick={onToggleActive}
            disabled={pending}
          >
            {active ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
            {active ? "Disattiva account" : "Riattiva account"}
          </Button>
        ) : null}
        {!isSelf ? (
          <Button variant="ghost" className="text-danger" onClick={onDelete} disabled={pending}>
            <Trash2 aria-hidden /> Elimina account
          </Button>
        ) : null}
        <FormMessage result={result} />
      </div>
      <CredentialsDialog
        credentials={credentials}
        onClose={() => {
          setCredentials(null);
          router.refresh();
        }}
      />
    </Card>
  );
}
