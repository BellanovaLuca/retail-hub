"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { installStandardRules } from "./actions";

/**
 * Prima apertura senza alcun set di regole: crea il set "Standard" con un'azione (non durante il
 * caricamento della pagina) e ricarica. Parte da sola, come prima; se non riesce resta il pulsante.
 */
export function InstallStandardRules() {
  const router = useRouter();
  const started = useRef(false);
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function install() {
    setPending(true);
    setMessage(null);
    const res = await installStandardRules();
    if (res.ok) {
      router.refresh();
      return;
    }
    setMessage(res.message);
    setPending(false);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void install();
    // Solo al primo caricamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <p className="text-sm text-muted">
        {pending ? "Preparazione delle regole standard…" : "Non ci sono ancora regole."}
      </p>
      {message ? <FormMessage result={{ ok: false, message }} /> : null}
      {!pending ? <Button onClick={() => void install()}>Crea le regole standard</Button> : null}
    </div>
  );
}
