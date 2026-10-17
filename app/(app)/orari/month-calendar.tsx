import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

/** Calendario del mese (lun→dom) con l'orario di ogni giorno. */
export function MonthCalendar({
  month,
  today,
  days,
  leaves,
}: {
  month: string;
  today: string;
  days: Record<string, { text: string; changed: boolean }>;
  leaves: Record<string, string>;
}) {
  const first = startOfMonth(parseISO(`${month}-01`));
  const last = endOfMonth(first);
  const start = startOfWeek(first, { weekStartsOn: 1 });
  const cells: Date[] = [];
  for (let d = start; d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
          <div key={d} className="py-2 text-center eyebrow">
            {d}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-7">
        {cells.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const inMonth = d.getMonth() === first.getMonth();
          const entry = days[iso];
          const leave = leaves[iso];
          return (
            <li
              key={iso}
              aria-current={iso === today ? "date" : undefined}
              className={cn(
                "flex min-h-16 flex-col gap-1 border-r border-b border-line p-1.5 first:border-l sm:min-h-24 sm:p-2 [&:nth-child(7n+1)]:border-l",
                !inMonth && "bg-surface/60 text-subtle",
                iso === today && "border-t-[3px] border-t-foreground",
              )}
            >
              <span className="text-xs text-muted nums">{d.getDate()}</span>
              {entry?.text ? (
                <span className="text-[0.6875rem] leading-tight nums sm:text-sm">
                  {entry.text}
                  {entry.changed ? (
                    <span
                      className="ml-1 inline-block size-1.5 rounded-full bg-warning"
                      aria-label="Modificato"
                    />
                  ) : null}
                </span>
              ) : leave ? (
                <span className="text-[0.6875rem] text-muted sm:text-xs">{leave}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
