"use client";

import { Field, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { LeaveStatus, LeaveType } from "@/lib/domain/types";

export type LeaveChoice = { type: LeaveType; status: LeaveStatus; hours: string };

export const DEFAULT_CHOICE: LeaveChoice = { type: "ferie", status: "confirmed", hours: "" };

/** Ore del permesso dal campo di testo ("4", "4,5"); null = giornata intera. */
export function choiceHours(choice: LeaveChoice): number | null {
  if (choice.type !== "permesso" || choice.hours.trim() === "") return null;
  const n = Number(choice.hours.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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
        <Field label="Ore" htmlFor={`${idPrefix}-hours`} className="w-28">
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
