"use client";

import { Field, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { LeaveStatus, LeaveType } from "@/lib/domain/types";
import { LEAVE_HOURS_MAX } from "@/lib/leaves/parse";

export type LeaveChoice = { type: LeaveType; status: LeaveStatus; hours: string };

export const DEFAULT_CHOICE: LeaveChoice = { type: "ferie", status: "confirmed", hours: "" };

/**
 * Ore del permesso dal campo di testo ("4", "4,5"); `null` = giornata intera.
 * Un testo non valido ("abc", "13", "4,3") NON viene ignorato: restituisce l'errore da mostrare.
 */
export function choiceHours(
  choice: LeaveChoice,
): { ok: true; hours: number | null } | { ok: false; error: string } {
  if (choice.type !== "permesso" || choice.hours.trim() === "") return { ok: true, hours: null };
  const text = choice.hours.trim().replace(",", ".");
  const n = /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(n)) return { ok: false, error: "Indica le ore (es. 4 o 4,5)." };
  if (n < 0.5) return { ok: false, error: "Indica le ore (es. 4 o 4,5)." };
  if (n > LEAVE_HOURS_MAX) return { ok: false, error: `Massimo ${LEAVE_HOURS_MAX} ore.` };
  if ((n * 2) % 1 !== 0) return { ok: false, error: "A mezz'ore." };
  return { ok: true, hours: n };
}

/** Tipo, stato e (per il permesso) ore: gli stessi campi nel dialog del giorno e sul periodo. */
export function LeaveChoiceFields({
  value,
  onChange,
  idPrefix,
}: {
  value: LeaveChoice;
  onChange: (v: LeaveChoice) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Field label="Tipo" htmlFor={`${idPrefix}-type`} className="w-40">
        <Select
          id={`${idPrefix}-type`}
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as LeaveType })}
        >
          <option value="ferie">Ferie</option>
          <option value="permesso">Permesso</option>
          <option value="malattia">Malattia</option>
          <option value="altro">Altra assenza</option>
        </Select>
      </Field>
      <Field label="Stato" htmlFor={`${idPrefix}-status`} className="w-44">
        <Select
          id={`${idPrefix}-status`}
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as LeaveStatus })}
        >
          <option value="confirmed">Confermate</option>
          <option value="tentative">Da confermare</option>
        </Select>
      </Field>
      {value.type === "permesso" ? (
        <Field
          label="Ore"
          htmlFor={`${idPrefix}-hours`}
          className="w-28"
          hint={`Da 0,5 a ${LEAVE_HOURS_MAX}, a mezz'ore.`}
        >
          <Input
            id={`${idPrefix}-hours`}
            inputMode="decimal"
            placeholder="Tutto il giorno"
            value={value.hours}
            onChange={(e) => onChange({ ...value, hours: e.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}
