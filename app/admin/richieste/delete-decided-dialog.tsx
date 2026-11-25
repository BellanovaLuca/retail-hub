"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, FormMessage } from "@/components/ui/form";
import type { DeleteGroup, RequestType } from "@/lib/requests";
import { deleteDecidedRequests } from "./actions";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * «Elimina tutte le approvate» / «Elimina tutte le rifiutate»: la conferma dice quante sono.
 * Con un filtro attivo (tipo, persona) elimina solo quelle dell'elenco filtrato.
 */
export function DeleteDecidedDialog({
  group,
  count,
  cancelledCount = 0,
  filters,
  filterLabel,
}: {
  group: DeleteGroup;
  /** Quante richieste del gruppo ci sono (con i filtri attivi), contate dal database. */
  count: number;
  /** Solo per le rifiutate: quante richieste annullate dai dipendenti si possono aggiungere. */
  cancelledCount?: number;
  filters: { type?: RequestType; profileId?: string };
  /** Descrizione dei filtri attivi ("Ferie · Anna"), se ce ne sono. */
  filterLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const approved = group === "approved";
  const total = count + (includeCancelled ? cancelledCount : 0);
  const label = filterLabel
    ? `Elimina le ${approved ? "approvate" : "rifiutate"} filtrate`
    : `Elimina tutte le ${approved ? "approvate" : "rifiutate"}`;

  const onDelete = () =>
    startTransition(async () => {
      const res = await deleteDecidedRequests({ group, includeCancelled, ...filters });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
      setResult(res);
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-sm text-muted nums">
        {approved
          ? plural(count, "richiesta approvata", "richieste approvate")
          : plural(count, "richiesta rifiutata", "richieste rifiutate")}
        {filterLabel ? ` · ${filterLabel}` : ""}
      </p>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          setOpen(o);
          if (o) {
            setIncludeCancelled(false);
            setResult(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-3 text-danger"
            disabled={count + cancelledCount === 0}
          >
            <Trash2 aria-hidden /> {label}
          </Button>
        </DialogTrigger>
        <DialogContent
          title={`Eliminare le richieste ${approved ? "approvate" : "rifiutate"}?`}
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
                  {total === 1 ? "Verrà eliminata" : "Verranno eliminate"}{" "}
                  {plural(total, "richiesta", "richieste")}, con commenti e allegati.
                </p>
                <p className="text-muted">
                  {approved
                    ? plural(count, "approvata", "approvate")
                    : plural(count, "rifiutata", "rifiutate")}
                  {includeCancelled ? ` · ${plural(cancelledCount, "annullata", "annullate")}` : ""}
                  {filterLabel ? ` · solo ${filterLabel}` : ""}
                </p>
              </div>
            </section>

            {approved ? (
              <p className="text-muted">
                Ferie, permessi e assenze creati da queste richieste restano nel calendario ferie e
                nei turni: per toglierli usa Ferie o il foglio turni. Gli scambi di turno già fatti
                restano come sono.
              </p>
            ) : (
              <>
                {cancelledCount > 0 ? (
                  <Checkbox
                    label={`Elimina anche ${cancelledCount === 1 ? "la richiesta annullata" : `le ${cancelledCount} richieste annullate`} dai dipendenti`}
                    checked={includeCancelled}
                    onChange={(e) => setIncludeCancelled(e.target.checked)}
                    disabled={pending}
                  />
                ) : null}
                <p className="text-muted">
                  Sono comprese quelle rifiutate dal collega negli scambi. Le richieste in attesa e
                  quelle approvate non vengono toccate.
                </p>
              </>
            )}

            <FormMessage result={result} />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending}>
                  Annulla
                </Button>
              </DialogClose>
              <Button variant="danger" onClick={onDelete} disabled={pending || total === 0}>
                <Trash2 aria-hidden />
                {pending
                  ? "Eliminazione in corso…"
                  : `Elimina ${plural(total, "richiesta", "richieste")}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {!open && result?.ok ? (
        <div className="w-full">
          <FormMessage result={result} />
        </div>
      ) : null}
    </div>
  );
}
