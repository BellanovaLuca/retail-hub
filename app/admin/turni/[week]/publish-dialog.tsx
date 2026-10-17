"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import type { DayChange } from "@/lib/schedule/cells";
import type { SchedulePerson } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { publishWeek } from "../actions";

/** Finestra riassuntiva della pubblicazione: modifiche, avvisi aperti, chi notificare. */
export function PublishDialog({
  weekId,
  firstPublish,
  changes,
  people,
  warnings,
  warningsList,
  trigger,
  onPublished,
}: {
  weekId: string;
  firstPublish: boolean;
  changes: DayChange[];
  people: Map<string, SchedulePerson>;
  warnings?: number;
  warningsList?: React.ReactNode;
  trigger: React.ReactNode;
  /** Esito positivo: la finestra si chiude e il messaggio resta nella pagina. */
  onPublished?: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"changed" | "all">("changed");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const affected = new Set(changes.map((c) => c.profileId));

  function publish() {
    startTransition(async () => {
      const res = await publishWeek(weekId, firstPublish ? "all" : mode);
      if (res.ok) {
        setOpen(false);
        onPublished?.(res.message ?? "Settimana pubblicata.");
        router.refresh();
      } else {
        setResult(res);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setResult(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={firstPublish ? "Pubblica la settimana" : "Ripubblica la settimana"}
        description={
          firstPublish
            ? "I dipendenti vedranno i loro orari e riceveranno una notifica."
            : "Le modifiche diventano visibili ai dipendenti solo adesso."
        }
        wide
      >
        <div className="flex flex-col gap-6">
          {warnings ? (
            <section>
              <h3 className="mb-2 eyebrow text-warning">
                {warnings} avvis{warnings === 1 ? "o" : "i"} di copertura aperti
              </h3>
              {warningsList}
              <p className="mt-2 text-xs text-muted">Gli avvisi non bloccano la pubblicazione.</p>
            </section>
          ) : null}

          {!firstPublish ? (
            <section>
              <h3 className="mb-2 eyebrow">
                {changes.length === 0
                  ? "Nessuna modifica rispetto all'ultima pubblicazione"
                  : `${changes.length} giornate cambiate · ${affected.size} persone`}
              </h3>
              {changes.length > 0 ? (
                <ul className="max-h-56 divide-y divide-line overflow-y-auto border-y border-line text-sm">
                  {changes.map((c) => (
                    <li
                      key={`${c.profileId}${c.date}`}
                      className="grid grid-cols-[7rem_1fr] gap-3 py-2"
                    >
                      <span className="font-medium">
                        {people.get(c.profileId)?.displayName ?? "—"}
                      </span>
                      <span className="text-muted nums">
                        <span className="capitalize">
                          {format(parseISO(c.date), "EEE d", { locale: it })}
                        </span>
                        : <span className="line-through decoration-line-strong">{c.before}</span> →{" "}
                        <span className="text-foreground">{c.after}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <fieldset className="mt-4">
                <legend className="mb-2 eyebrow">Notifica</legend>
                <div
                  role="radiogroup"
                  className="grid grid-cols-1 border border-foreground sm:grid-cols-2"
                >
                  {(
                    [
                      ["changed", "Solo chi è cambiato"],
                      ["all", "Tutti quelli in turno"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={mode === value}
                      onClick={() => setMode(value)}
                      className={cn(
                        "min-h-11 px-3 text-sm",
                        mode === value ? "bg-foreground text-background" : "hover:bg-surface",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <FormMessage result={result} />
            <Button onClick={publish} disabled={pending}>
              {pending ? "Pubblicazione…" : firstPublish ? "Pubblica" : "Ripubblica"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
