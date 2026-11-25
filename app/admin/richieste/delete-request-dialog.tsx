"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { createsLeaves, type RequestStatus } from "@/lib/requests";
import { deleteRequests } from "./actions";

export type DeletableRequest = {
  id: string;
  person: string;
  /** Tipo leggibile ("Ferie") e periodo ("14–16 dic"). */
  title: string;
  detail: string;
  type: string;
  status: RequestStatus;
};

/** Cosa succede eliminando una richiesta approvata: assenze e scambi restano. */
export function approvedDeleteNote(type: string): string | null {
  if (type === "scambio_turno")
    return "Lo scambio già fatto resta com'è: i turni non tornano indietro.";
  if (createsLeaves(type))
    return "Le assenze che ha creato restano nel calendario ferie e nei turni: per toglierle usa Ferie o il foglio turni.";
  return null;
}

/** Conferma dell'eliminazione di una richiesta già decisa (dall'elenco o dal dettaglio). */
export function DeleteRequestDialog({
  request,
  onClose,
  onDeleted,
}: {
  /** null = finestra chiusa. */
  request: DeletableRequest | null;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const note = request?.status === "approved" ? approvedDeleteNote(request.type) : null;

  const onDelete = () => {
    if (!request) return;
    startTransition(async () => {
      const res = await deleteRequests([request.id]);
      if (res.ok) {
        setResult(null);
        onDeleted(res.message ?? "Richiesta eliminata.");
      } else setResult(res);
    });
  };

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(o) => {
        if (o || pending) return;
        setResult(null);
        onClose();
      }}
    >
      <DialogContent
        title="Eliminare la richiesta?"
        description={
          request ? `${request.person} · ${request.title} · ${request.detail}` : undefined
        }
      >
        <div className="flex flex-col gap-6 text-sm">
          <div className="flex flex-col gap-2">
            <p>
              La richiesta sparisce dall&apos;elenco, anche per chi l&apos;ha fatta, con commenti e
              allegato. L&apos;operazione è definitiva.
            </p>
            {note ? <p className="border-l-2 border-line-strong pl-3 text-muted">{note}</p> : null}
          </div>
          <FormMessage result={result} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Annulla
              </Button>
            </DialogClose>
            <Button variant="danger" onClick={onDelete} disabled={pending}>
              <Trash2 aria-hidden />
              {pending ? "Eliminazione in corso…" : "Elimina la richiesta"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Pulsante «Elimina richiesta» della pagina di dettaglio: dopo l'eliminazione torna all'elenco. */
export function DeleteRequestButton({ request }: { request: DeletableRequest }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Elimina richiesta
      </Button>
      <DeleteRequestDialog
        request={open ? request : null}
        onClose={() => setOpen(false)}
        onDeleted={() => {
          router.replace("/admin/richieste?tab=tutte");
          router.refresh();
        }}
      />
    </>
  );
}
