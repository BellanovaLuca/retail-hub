"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarX } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { leaveTitle } from "@/lib/schedule/leave-cells";
import type { LeaveRecord } from "@/lib/schedule/types";
import { removeLeaveDays } from "../actions";

/**
 * Comando rapido «Togli l'assenza» sulle celle selezionate del foglio: conferma con l'elenco
 * delle giornate, poi toglie le assenze (i turni restano, senza più il segnale di conflitto).
 */
export function RemoveLeavesDialog({
  weekId,
  leaves,
  names,
  onClose,
  onRemoved,
}: {
  weekId: string;
  /** Assenze nelle celle selezionate; null = finestra chiusa. */
  leaves: LeaveRecord[] | null;
  names: Map<string, string>;
  onClose: () => void;
  onRemoved: (message?: string) => void;
}) {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const list = leaves ?? [];
  const fromRequest = list.filter((l) => l.source === "request").length;

  const onRemove = () =>
    startTransition(async () => {
      const res = await removeLeaveDays(
        weekId,
        list.map((l) => ({ profileId: l.profileId, date: l.date })),
      );
      if (res.ok) {
        setResult(null);
        onRemoved(res.message);
      } else setResult(res);
    });

  return (
    <Dialog
      open={leaves !== null}
      onOpenChange={(o) => {
        if (o || pending) return;
        setResult(null);
        onClose();
      }}
    >
      <DialogContent
        title={list.length === 1 ? "Togliere l'assenza?" : `Togliere ${list.length} assenze?`}
        description="I turni scritti in quei giorni restano, senza più il segnale di conflitto."
      >
        <div className="flex flex-col gap-6 text-sm">
          <ul className="max-h-64 divide-y divide-line overflow-y-auto border-y border-line">
            {list.map((l) => (
              <li
                key={`${l.profileId}|${l.date}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span>
                  <span className="font-medium">{names.get(l.profileId) ?? "—"}</span>
                  <span className="text-muted">
                    {" "}
                    · {format(parseISO(l.date), "EEE d MMM", { locale: it })}
                  </span>
                </span>
                <span className="text-muted">{leaveTitle(l)}</span>
              </li>
            ))}
          </ul>
          {fromRequest > 0 ? (
            <p className="text-muted">
              {fromRequest === 1
                ? "Un'assenza viene da una richiesta approvata"
                : `${fromRequest} assenze vengono da richieste approvate`}
              : il dipendente riceve un avviso e gli altri giorni della richiesta restano approvati.
              Per togliere una richiesta intera apri il dettaglio della giornata (doppio clic sulla
              cella).
            </p>
          ) : null}
          <FormMessage result={result} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Annulla
              </Button>
            </DialogClose>
            <Button onClick={onRemove} disabled={pending || list.length === 0}>
              <CalendarX aria-hidden />
              {pending
                ? "Un momento…"
                : list.length === 1
                  ? "Togli l'assenza"
                  : `Togli ${list.length} assenze`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
