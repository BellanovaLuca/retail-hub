"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { PersonDot } from "@/components/ui/table";

export type PickerPerson = { id: string; name: string; color: string | null; hint?: string };

/** Multiselezione di persone con ricerca (destinatari, assegnatari). */
export function PeoplePicker({
  people,
  value,
  onChange,
  disabled,
  label = "Persone",
}: {
  people: PickerPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase("it-IT");
  const visible = q
    ? people.filter((p) => `${p.name} ${p.hint ?? ""}`.toLocaleLowerCase("it-IT").includes(q))
    : people;
  const selected = new Set(value);

  function toggle(personId: string) {
    onChange(selected.has(personId) ? value.filter((x) => x !== personId) : [...value, personId]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="sr-only">
          Cerca {label.toLowerCase()}
        </label>
        <Input
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome"
          disabled={disabled}
          className="h-9"
        />
        <span className="shrink-0 text-xs text-muted nums" aria-live="polite">
          {value.length} {value.length === 1 ? "selezionata" : "selezionate"}
        </span>
      </div>
      <ul
        aria-label={label}
        className="max-h-64 overflow-y-auto rounded-md border border-line px-3"
      >
        {visible.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line text-sm last:border-b-0">
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                disabled={disabled}
              />
              <PersonDot color={p.color} />
              <span className="flex-1">{p.name}</span>
              {p.hint ? <span className="text-xs text-muted">{p.hint}</span> : null}
            </label>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="py-3 text-sm text-muted">Nessuna persona trovata.</li>
        ) : null}
      </ul>
    </div>
  );
}
