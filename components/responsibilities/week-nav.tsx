import { addDays, format, getISOWeek, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Frecce per le settimane (non oltre la corrente). `hrefFor` riceve il lunedì. */
export function WeekNav({
  weekStart,
  currentWeekStart,
  basePath,
  query = {},
}: {
  weekStart: string;
  currentWeekStart: string;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const monday = parseISO(weekStart);
  const prev = format(addDays(monday, -7), "yyyy-MM-dd");
  const next = format(addDays(monday, 7), "yyyy-MM-dd");
  const href = (week: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v);
    if (week !== currentWeekStart) sp.set("settimana", week);
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const sunday = addDays(monday, 6);
  const range =
    monday.getMonth() === sunday.getMonth()
      ? `${format(monday, "d")}–${format(sunday, "d MMMM", { locale: it })}`
      : `${format(monday, "d MMM", { locale: it })} – ${format(sunday, "d MMM", { locale: it })}`;
  const canNext = weekStart < currentWeekStart;
  const arrow =
    "grid size-11 place-items-center rounded-md border border-line-strong hover:border-foreground";

  return (
    <div className="flex items-center gap-2">
      <Link href={href(prev)} className={arrow} aria-label="Settimana precedente" scroll={false}>
        <ChevronLeft className="size-4 stroke-[1.5]" />
      </Link>
      <p className="min-w-44 text-center text-sm nums">
        <span className="font-medium">Week {getISOWeek(monday)}</span>
        <span className="text-muted"> · {range}</span>
      </p>
      {canNext ? (
        <Link href={href(next)} className={arrow} aria-label="Settimana successiva" scroll={false}>
          <ChevronRight className="size-4 stroke-[1.5]" />
        </Link>
      ) : (
        <span className={cn(arrow, "opacity-30")} aria-hidden>
          <ChevronRight className="size-4 stroke-[1.5]" />
        </span>
      )}
      {weekStart !== currentWeekStart ? (
        <Link
          href={href(currentWeekStart)}
          className="ml-2 link-underline text-sm text-muted"
          scroll={false}
        >
          Questa settimana
        </Link>
      ) : null}
    </div>
  );
}
