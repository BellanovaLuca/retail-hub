"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** Filtro del tabellone: tutte / solo le mie / per persona (cerca chi si occupa di cosa). */
export function PersonFilter({
  people,
  viewerId,
  selected,
}: {
  people: { id: string; name: string }[];
  viewerId: string;
  selected: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (persona: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (persona) sp.set("persona", persona);
    else sp.delete("persona");
    const s = sp.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-sm border px-3 text-xs font-medium tracking-[0.06em] uppercase",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-line-strong text-muted hover:border-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={hrefFor(null)}
        className={chip(!selected)}
        aria-current={!selected ? "true" : undefined}
      >
        Tutte
      </Link>
      <Link
        href={hrefFor(viewerId)}
        className={chip(selected === viewerId)}
        aria-current={selected === viewerId ? "true" : undefined}
      >
        Solo le mie
      </Link>
      <label htmlFor="filtro-persona" className="sr-only">
        Di cosa si occupa…
      </label>
      <Select
        id="filtro-persona"
        className="w-56"
        value={selected && selected !== viewerId ? selected : ""}
        onChange={(e) => router.push(hrefFor(e.target.value || null), { scroll: false })}
      >
        <option value="">Di cosa si occupa…</option>
        {people
          .filter((p) => p.id !== viewerId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </Select>
    </div>
  );
}
