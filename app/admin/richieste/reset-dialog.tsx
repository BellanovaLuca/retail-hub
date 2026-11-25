"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RESET_CONFIRM_WORD } from "@/lib/requests";
import { resetAllRequests } from "./actions";

/** «Azzera richieste»: elimina tutte le richieste dei dipendenti, anche quelle approvate. */
export function ResetRequestsDialog({
  counts,
}: {
  counts: { total: number; pending: number; approved: number; other: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [removeLeaves, setRemoveLeaves] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmed = typed.trim().toUpperCase() === RESET_CONFIRM_WORD;

  const onReset = () =>
    startTransition(async () => {
      const res = await resetAllRequests({ removeLeaves, confirm: typed });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
      setResult(res);
    });

  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          setOpen(o);
          if (o) {
            setTyped("");
            setRemoveLeaves(false);
            setResult(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-danger" disabled={counts.total === 0}>
            <RotateCcw aria-hidden /> Azzera tutte le richieste
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Azzerare tutte le richieste?"
          description="L'operazione è definitiva: le richieste eliminate non si recuperano."
        >
          <div className="flex flex-col gap-6 text-sm">
            <section
              role="alert"
              className="flex gap-3 rounded-md border border-danger/40 p-4 text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              <div className="flex flex-col gap-1.5">
                <p className="font-medium">
                  Verranno eliminate {n(counts.total, "richiesta", "richieste")} di tutti i
                  dipendenti, con commenti e allegati:
                </p>
                <p className="text-muted">
                  {n(counts.pending, "in attesa", "in attesa")} ·{" "}
                  {n(counts.approved, "approvata", "approvate")} ·{" "}
                  {n(counts.other, "rifiutata o annullata", "rifiutate o annullate")}
                </p>
              </div>
            </section>

            <Checkbox
              label="Togli anche ferie, permessi e assenze nati dalle richieste approvate"
              description={
                removeLeaves
                  ? "Spariscono dal calendario ferie e dai turni come se le richieste non fossero mai state approvate."
                  : "Se non lo spunti restano nel calendario ferie e nei turni come sono adesso."
              }
              checked={removeLeaves}
              onChange={(e) => setRemoveLeaves(e.target.checked)}
              disabled={pending}
            />
            <p className="text-muted">
              Gli scambi di turno già approvati restano come sono. Le ferie inserite a mano in Ferie
              non vengono toccate.
            </p>

            <div className="flex flex-col gap-2">
              <label htmlFor="confirm-reset" className="text-sm">
                Per confermare scrivi <strong className="font-medium">{RESET_CONFIRM_WORD}</strong>
              </label>
              <Input
                id="confirm-reset"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
              />
            </div>

            <FormMessage result={result} />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending}>
                  Annulla
                </Button>
              </DialogClose>
              <Button variant="danger" onClick={onReset} disabled={!confirmed || pending}>
                <RotateCcw aria-hidden />
                {pending ? "Eliminazione in corso…" : "Azzera le richieste"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {!open && result?.ok ? <FormMessage result={result} /> : null}
    </>
  );
}
