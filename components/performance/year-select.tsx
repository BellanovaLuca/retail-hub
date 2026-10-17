"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form";

/** Selettore dell'anno: naviga a `hrefFor(anno)`. */
export function YearSelect({
  year,
  years,
  basePath,
  mode,
}: {
  year: number;
  years: number[];
  /** "/admin/performance" → /admin/performance/2026; "/performance" → /performance?anno=2026 */
  basePath: string;
  mode: "segment" | "query";
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Anno"
      value={String(year)}
      onChange={(e) =>
        router.push(
          mode === "segment"
            ? `${basePath}/${e.target.value}`
            : `${basePath}?anno=${e.target.value}`,
        )
      }
      className="w-32"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  );
}
