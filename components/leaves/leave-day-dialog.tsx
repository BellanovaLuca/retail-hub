"use client";

import { Search, X } from "lucide-react";
import * as React from "react";
import {
  applyLeaveRange,
  removeLeaveRange,
  type SaveLeavesResult,
} from "@/app/admin/ferie/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PersonDot } from "@/components/ui/table";
import type { ActionResult } from "@/lib/auth/guards";
import { MONTH_NAMES } from "@/lib/leaves/plan";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CHOICE,
  LeaveChoiceFields,
  choiceHours,
  type LeaveChoice,
} from "./leave-form-fields";
import { leaveDescription, type PlannerLeave, type PlannerPerson } from "./types";

type Retry = { label: string; run: () => Promise<ActionResult<SaveLeavesResult>> };

/** Dialog del giorno (vista calendario, admin): chi è in ferie, aggiungi o togli persone. */
export function LeaveDayDialog({
  date,
  entries,
  people,
  onClose,
  onSaved,
}: {
  date: string;
  entries: PlannerLeave[];
  people: PlannerPerson[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [choice, setChoice] = React.useState<LeaveChoice>(DEFAULT_CHOICE);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [retry, setRetry] = React.useState<Retry | null>(null);
  const [pending, startTransition] = React.useTransition();

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const onLeave = new Set(entries.map((e) => e.profileId));
  const q = query.trim().toLowerCase();
  const candidates = people.filter(
    (p) => !onLeave.has(p.id) && (q === "" || p.displayName.toLowerCase().includes(q)),
  );

  const [y, m, d] = date.split("-").map(Number);
  const title = `${d} ${MONTH_NAMES[m - 1].toLowerCase()} ${y}`;

  const run = (
    fn: () => Promise<ActionResult<SaveLeavesResult>>,
    retryLabel: string,
    again: () => Promise<ActionResult<SaveLeavesResult>>,
  ) =>
    startTransition(async () => {
      const res = await fn();
      setMessage({ ok: res.ok, text: res.message ?? "" });
      if (res.ok && res.data?.skippedRequests) {
        setRetry({ label: retryLabel, run: again });
      } else {
        setRetry(null);
      }
      if (res.ok) onSaved();
    });

  const add = (profileId: string) => {
    const hours = choiceHours(choice);
    if (!hours.ok) {
      setMessage({ ok: false, text: hours.error });
      setRetry(null);
      return;
    }
    const payload = {
      profileIds: [profileId],
      from: date,
      to: date,
      type: choice.type,
      status: choice.status,
      hours: hours.hours,
    };
    run(
      () => applyLeaveRange(payload),
      "Sovrascrivi comunque",
      () => applyLeaveRange({ ...payload, overrideRequests: true }),
    );
  };

  const remove = (entry: PlannerLeave) => {
    const payload = { profileIds: [entry.profileId], from: date, to: date };
    if (entry.source === "request") {
      setMessage({
        ok: false,
        text: `L'assenza di ${peopleById.get(entry.profileId)?.displayName ?? ""} nasce da una richiesta approvata.`,
      });
      setRetry({
        label: "Togli comunque",
        run: () => removeLeaveRange({ ...payload, overrideRequests: true }),
      });
      return;
    }
    run(
      () => removeLeaveRange(payload),
      "Togli comunque",
      () => removeLeaveRange({ ...payload, overrideRequests: true }),
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description="Chi è in ferie o assente in questo giorno.">
        <section className="mb-8">
          <h3 className="mb-2 eyebrow">In ferie o assenti</h3>
          {entries.length === 0 ? (
            <p className="text-sm text-muted">Nessuno.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {entries.map((e) => {
                const person = peopleById.get(e.profileId);
                return (
                  <li key={e.profileId} className="flex min-h-11 items-center gap-3 text-sm">
                    <PersonDot color={person?.color ?? null} />
                    <span className="flex-1 truncate">
                      {person?.displayName ?? "—"}
                      <span className="ml-2 text-xs text-muted">
                        {leaveDescription(e, "admin")}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Togli ${person?.displayName ?? ""}`}
                      disabled={pending}
                      onClick={() => remove(e)}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="eyebrow">Aggiungi</h3>
          <LeaveChoiceFields value={choice} onChange={setChoice} idPrefix="day" />
          <div>
            <Label htmlFor="day-search" className="mb-2">
              Persona
            </Label>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 stroke-[1.5] text-muted"
              />
              <Input
                id="day-search"
                className="pl-9"
                placeholder="Cerca per nome visualizzato"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>
            <ul className="mt-2 max-h-56 overflow-y-auto border-y border-line">
              {candidates.length === 0 ? (
                <li className="py-3 text-sm text-muted">Nessuna persona trovata.</li>
              ) : (
                candidates.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => add(p.id)}
                      className="flex min-h-11 w-full items-center gap-3 border-b border-line text-left text-sm last:border-b-0 hover:bg-surface disabled:opacity-50"
                    >
                      <PersonDot color={p.color} className="ml-1" />
                      <span className="flex-1">{p.displayName}</span>
                      <span className="mr-2 text-xs text-muted">Aggiungi</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        {message?.text ? (
          <div
            role={message.ok ? "status" : "alert"}
            className={cn(
              "mt-6 flex flex-wrap items-center gap-3 text-sm",
              message.ok && !retry ? "text-success" : "text-warning",
            )}
          >
            <span>{message.text}</span>
            {retry ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => run(retry.run, retry.label, retry.run)}
              >
                {retry.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
