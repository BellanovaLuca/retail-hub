"use client";

import { useEffect } from "react";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-8 sm:px-10">
      <Wordmark />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <p className="mb-3 eyebrow">Qualcosa è andato storto</p>
        <h1 className="mb-6 font-display text-4xl font-light tracking-tight">
          Non siamo riusciti a mostrare la pagina
        </h1>
        <p className="mb-10 text-muted">
          Riprova tra un momento. Se succede ancora, avvisa un responsabile
          {error.digest ? ` (codice ${error.digest})` : ""}.
        </p>
        <Button size="lg" onClick={reset}>
          Riprova
        </Button>
      </main>
    </div>
  );
}
