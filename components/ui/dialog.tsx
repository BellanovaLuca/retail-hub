"use client";

import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/** Finestra modale centrata su desktop, foglio dal basso su telefono. */
export function DialogContent({
  title,
  description,
  className,
  children,
  wide,
}: {
  title: string;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <RadixDialog.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-lg border-t border-line bg-background px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:p-8",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
          "data-[state=open]:animate-[fade-in_150ms_ease-out]",
          className,
        )}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <RadixDialog.Title className="font-display text-2xl font-light tracking-tight">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-2 text-sm text-muted">
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground"
            aria-label="Chiudi"
          >
            <X className="size-5 stroke-[1.5]" />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
