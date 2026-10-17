"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Credentials } from "./actions";

/** Codice e PIN provvisorio, mostrati UNA SOLA VOLTA (§4). */
export function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: Credentials | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={credentials !== null} onOpenChange={(open) => !open && onClose()}>
      {credentials ? (
        <DialogContent
          title={`Accesso di ${credentials.displayName}`}
          description="Il PIN provvisorio si vede solo adesso: mandalo subito al dipendente. Al primo accesso dovrà sceglierne uno suo."
        >
          <dl className="mb-6 grid grid-cols-2 gap-4 border-y border-line py-5">
            <div>
              <dt className="mb-1 eyebrow">Codice</dt>
              <dd className="font-display text-3xl font-light nums">{credentials.code}</dd>
            </div>
            <div>
              <dt className="mb-1 eyebrow">PIN provvisorio</dt>
              <dd className="font-display text-3xl font-light tracking-[0.15em] nums">
                {credentials.pin}
              </dd>
            </div>
          </dl>
          <pre className="mb-6 rounded-md bg-surface p-4 font-sans text-sm whitespace-pre-wrap">
            {credentials.message}
          </pre>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Ho finito
            </Button>
            <Button onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copiato" : "Copia messaggio"}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
