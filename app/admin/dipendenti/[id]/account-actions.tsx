"use client";

import { KeyRound, UserX, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { resetPin, setEmployeeActive, type Credentials } from "../actions";
import { CredentialsDialog } from "../credentials-dialog";

export function AccountActions({
  id,
  active,
  isSelf,
}: {
  id: string;
  active: boolean;
  isSelf: boolean;
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
