"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { Input, Label } from "@/components/ui/input";

/**
 * Pulsante «Aggiungi colonna»: sempre attivo, apre una finestra che chiede il nome. L'esito
 * negativo (nome già usato…) resta scritto nella finestra, accanto al campo.
 */
export function AddColumn({
  buttonLabel = "Aggiungi colonna",
  title,
  description,
  fieldLabel = "Nome della colonna",
  placeholder,
  maxLength = 120,
  disabled,
  onAdd,
}: {
  buttonLabel?: string;
  title: string;
  description?: string;
  fieldLabel?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** Crea la colonna; con `ok: false` il messaggio viene mostrato nella finestra. */
  onAdd: (name: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setResult({ ok: false, message: "Scrivi il nome della colonna." });
      return;
    }
    startTransition(async () => {
      const res = await onAdd(name.trim());
      if (res.ok) {
        setOpen(false);
        setName("");
        setResult(null);
      } else {
        setResult(res);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) setResult(null);
      }}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden /> {buttonLabel}
      </Button>
      <DialogContent title={title} description={description}>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{fieldLabel}</Label>
            <Input
              id={id}
              autoFocus
              autoComplete="off"
              placeholder={placeholder}
              maxLength={maxLength}
              value={name}
              disabled={pending}
              onChange={(e) => {
                setName(e.target.value);
                setResult(null);
              }}
            />
          </div>
          <FormMessage result={result} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Annulla
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              <Plus aria-hidden /> {pending ? "Aggiungo…" : "Aggiungi"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
