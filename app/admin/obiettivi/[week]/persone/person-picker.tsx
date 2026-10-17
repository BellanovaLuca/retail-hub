"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form";
import { Label } from "@/components/ui/input";

/** Selettore della persona su schermi stretti. */
export function PersonPicker({
  base,
  value,
  people,
}: {
  base: string;
  value: string;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="persona">Persona</Label>
      <Select
        id="persona"
        value={value}
        onChange={(e) => router.push(`${base}?persona=${e.target.value}`)}
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
