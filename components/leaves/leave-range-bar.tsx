"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  applyLeaveRange,
  removeLeaveRange,
  type SaveLeavesResult,
} from "@/app/admin/ferie/actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import type { ActionResult } from "@/lib/auth/guards";
import { dateRange, formatRangeIt, leaveRequestHref } from "@/lib/leaves/plan";
import { cn } from "@/lib/utils";
import type { DayRange } from "./leave-calendar";
import {
  DEFAULT_CHOICE,
  LeaveChoiceFields,
  choiceHours,
  type LeaveChoice,
} from "./leave-form-fields";
import type { PlannerMode, PlannerPerson } from "./types";

/**
 * Barra del periodo selezionato. Admin: applica (o togli) le ferie di una persona su tutto il
 * periodo. Dipendente: porta alla richiesta di ferie con le date già compilate.
 */
export function LeaveRangeBar({
  mode,
  range,
  people,
  onClear,
  onSaved,
}: {
  mode: PlannerMode;
  range: DayRange;
  people: PlannerPerson[];
  onClear: () => void;
  onSaved: () => void;
}) {
  const days = dateRange(range.from, range.to).length;
  const label = `${formatRangeIt(range.from, range.to)} · ${days} ${days === 1 ? "giorno" : "giorni"}`;

  if (mode === "employee") {
    return (
      <Bar label={label} onClear={onClear} raised>
        <Button asChild size="sm">
          <Link href={leaveRequestHref(range.from, range.to)}>
            Richiedi ferie <ArrowRight aria-hidden />
          </Link>
        </Button>
      </Bar>
    );
  }
  return (
    <AdminRange range={range} label={label} people={people} onClear={onClear} onSaved={onSaved} />
  );
}

function Bar({
  label,
  onClear,
  children,
  raised,
}: {
  label: string;
  onClear: () => void;
  children: React.ReactNode;
  /** Sopra la tab bar del telefono (area dipendente). */
  raised?: boolean;
}) {
  return (
    <div
      role="region"
      aria-label="Periodo selezionato"
      className={cn(
        "sticky bottom-4 z-40 mt-6 flex flex-col gap-4 border border-foreground bg-background p-4 sm:p-5",
        raised && "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Periodo selezionato</p>
          <p className="mt-1 text-sm nums">{label}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Annulla selezione"
          onClick={onClear}
          className="-mt-2 -mr-2"
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}

function AdminRange({
  range,
  label,
  people,
  onClear,
  onSaved,
}: {
  range: DayRange;
  label: string;
  people: PlannerPerson[];
  onClear: () => void;
  onSaved: () => void;
}) {
  const [profileId, setProfileId] = React.useState("");
  const [choice, setChoice] = React.useState<LeaveChoice>(DEFAULT_CHOICE);
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [retry, setRetry] = React.useState<(() => Promise<ActionResult<SaveLeavesResult>>) | null>(
    null,
  );
  const [pending, startTransition] = React.useTransition();

  const run = (
    fn: () => Promise<ActionResult<SaveLeavesResult>>,
    again: () => Promise<ActionResult<SaveLeavesResult>>,
  ) =>
    startTransition(async () => {
      const res = await fn();
      setResult({ ok: res.ok, text: res.message ?? "" });
      setRetry(() => (res.ok && res.data?.skippedRequests ? again : null));
      if (res.ok) onSaved();
    });

  const apply = () => {
    if (!profileId) {
      setResult({ ok: false, text: "Scegli una persona." });
      return;
    }
    const payload = {
      profileIds: [profileId],
      from: range.from,
      to: range.to,
      type: choice.type,
      status: choice.status,
      hours: choiceHours(choice),
    };
    run(
      () => applyLeaveRange(payload),
      () => applyLeaveRange({ ...payload, overrideRequests: true }),
    );
  };

  const remove = () => {
    if (!profileId) {
      setResult({ ok: false, text: "Scegli una persona." });
      return;
    }
    const payload = { profileIds: [profileId], from: range.from, to: range.to };
    run(
      () => removeLeaveRange(payload),
      () => removeLeaveRange({ ...payload, overrideRequests: true }),
    );
  };

  return (
    <Bar label={label} onClear={onClear}>
      <Field label="Persona" htmlFor="range-person" className="w-44">
        <Select id="range-person" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">Scegli…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <LeaveChoiceFields value={choice} onChange={setChoice} idPrefix="range" />
      <div className="flex gap-2">
        <Button size="md" disabled={pending} onClick={apply}>
          Applica al periodo
        </Button>
        <Button size="md" variant="secondary" disabled={pending} onClick={remove}>
          Togli
        </Button>
      </div>
      {result?.text ? (
        <div
          role={result.ok ? "status" : "alert"}
          className={cn(
            "flex w-full flex-wrap items-center gap-3 text-sm",
            result.ok && !retry ? "text-success" : "text-warning",
          )}
        >
          <span>{result.text}</span>
          {retry ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(retry, retry)}
            >
              Modifica anche quei giorni
            </Button>
          ) : null}
        </div>
      ) : null}
    </Bar>
  );
}
