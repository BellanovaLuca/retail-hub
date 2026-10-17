"use client";

import { Dialog } from "radix-ui";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";

/** Foglio dal basso per modificare una cella su telefono (§8: niente scorciatoie da tastiera). */
export function MobileSheet({
  open,
  title,
  description,
  error,
  onOpenChange,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-200 starting:opacity-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-lg border-t border-line bg-background px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-transform duration-200 starting:translate-y-full">
          <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
          <Dialog.Title className="eyebrow">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 mb-4 text-sm text-muted">
            {description}
          </Dialog.Description>
          {children}
          {error ? (
            <div className="mt-3">
              <FieldError>{error}</FieldError>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Editor predefinito: campo di testo + Salva / Svuota / Annulla. */
export function DefaultMobileEditor({
  value,
  commit,
  close,
}: {
  value: string;
  commit: (value: string) => void;
  close: () => void;
}) {
  const [draft, setDraft] = React.useState(value);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        commit(draft.trim());
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        aria-label="Valore della cella"
        className="nums"
      />
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Annulla
        </Button>
        <Button type="button" variant="secondary" onClick={() => commit("")}>
          Svuota
        </Button>
        <Button type="submit">Salva</Button>
      </div>
    </form>
  );
}
