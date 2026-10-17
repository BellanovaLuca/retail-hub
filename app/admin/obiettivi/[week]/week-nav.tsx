"use client";

import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Frecce tra le settimane restando nella stessa scheda (e sulla stessa persona). */
export function WeekNav({ weekStart, weekNumber }: { weekStart: string; weekNumber: number }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const href = (offset: number) => {
    const target = format(addDays(parseISO(weekStart), offset), "yyyy-MM-dd");
    const path = pathname.replace(`/admin/obiettivi/${weekStart}`, `/admin/obiettivi/${target}`);
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
  };
  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="ghost" size="icon" aria-label="Settimana precedente">
        <Link href={href(-7)}>
          <ChevronLeft />
        </Link>
      </Button>
      <h1 className="font-display text-4xl font-light tracking-tight nums">Week {weekNumber}</h1>
      <Button asChild variant="ghost" size="icon" aria-label="Settimana successiva">
        <Link href={href(7)}>
          <ChevronRight />
        </Link>
      </Button>
    </div>
  );
}
