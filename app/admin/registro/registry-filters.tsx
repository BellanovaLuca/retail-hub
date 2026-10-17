"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form";

export function RegistryFilters({
  values,
  admins,
  people,
  types,
}: {
  values: { autore: string; persona: string; tipo: string };
  admins: { id: string; name: string }[];
  people: { id: string; name: string }[];
  types: { value: string; label: string }[];
}) {
  const router = useRouter();
  function set(key: keyof typeof values, value: string) {
    const next = new URLSearchParams(
      Object.entries({ ...values, [key]: value }).filter(([, v]) => v),
    );
    router.push(`/admin/registro?${next.toString()}`);
  }
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <Select
        aria-label="Fatto da"
        value={values.autore}
        onChange={(e) => set("autore", e.target.value)}
      >
        <option value="">Tutti gli admin</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Persona interessata"
        value={values.persona}
        onChange={(e) => set("persona", e.target.value)}
      >
        <option value="">Tutte le persone</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Tipo" value={values.tipo} onChange={(e) => set("tipo", e.target.value)}>
        <option value="">Tutti i tipi</option>
        {types.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
