import { Check } from "lucide-react";
import { PersonDot } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DAY_LETTERS, scheduleLabel } from "./format";

export type WeekGridColumn = {
  id: string;
  title: string;
  scheduleDays: number[];
  allStaff: boolean;
  /** Assegnati della settimana (ignorato per le attività «per tutti»). */
  profileIds: string[];
};

/** Giorni previsti in piccolo: L M M G V S D, scuri quelli in cui l'attività va fatta. */
export function DayLettersInline({ days, className }: { days: number[]; className?: string }) {
  return (
    <span
      role="img"
      aria-label={scheduleLabel(days)}
      title={scheduleLabel(days)}
      className={cn("inline-flex gap-[3px] text-[0.625rem] font-semibold", className)}
    >
      {DAY_LETTERS.map((letter, i) => (
        <span
          key={i}
          aria-hidden
          className={days.includes(i + 1) ? "text-foreground" : "text-line-strong"}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

/**
 * Griglia completa del negozio, in sola lettura: tutte le persone in riga, tutte le
 * responsabilità in colonna, un segno dove la persona è assegnata nella settimana. La riga di chi
 * guarda (o della persona scelta) è evidenziata.
 */
export function WeekGrid({
  columns,
  people,
  highlightId,
  viewerId,
  caption,
}: {
  columns: WeekGridColumn[];
  people: { id: string; name: string; color: string | null }[];
  highlightId: string;
  viewerId: string;
  caption: string;
}) {
  if (columns.length === 0) {
    return (
      <p className="py-6 font-display text-xl font-light text-subtle">
        Nessuna responsabilità ancora assegnata.
      </p>
    );
  }
  return (
    // Area scorrevole raggiungibile da tastiera (non contiene campi su cui fermarsi).
    <div
      className="overflow-x-auto rounded-md border border-line focus-visible:outline-2 focus-visible:outline-foreground"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="w-max min-w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-36 border-b border-line bg-background px-3 py-2 text-left align-bottom eyebrow font-semibold"
            >
              Persona
            </th>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className="w-24 min-w-24 border-b border-l border-line px-2 py-2 text-center align-bottom font-medium"
              >
                <span className="line-clamp-3 leading-tight">{c.title}</span>
                <DayLettersInline days={c.scheduleDays} className="mt-1.5" />
                {c.allStaff ? (
                  <span className="mt-0.5 block text-[0.6875rem] font-normal text-subtle">
                    per tutti
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const mine = p.id === highlightId;
            return (
              <tr key={p.id} className={cn(mine && "bg-foreground/[0.06]")}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 border-b border-line px-3 py-2 text-left whitespace-nowrap",
                    mine
                      ? "bg-surface font-semibold shadow-[inset_3px_0_0_var(--foreground)]"
                      : "bg-background font-normal",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <PersonDot color={p.color} /> {p.name}
                    {mine && p.id === viewerId ? (
                      <span className="eyebrow text-[0.625rem]">tu</span>
                    ) : null}
                  </span>
                </th>
                {columns.map((c) => {
                  const on = c.allStaff || c.profileIds.includes(p.id);
                  return (
                    <td key={c.id} className="border-b border-l border-line p-1 text-center">
                      {on ? (
                        <span
                          className={cn(
                            "mx-auto grid size-7 place-items-center rounded-sm",
                            c.allStaff
                              ? "border border-line-strong text-muted"
                              : "bg-foreground text-background",
                          )}
                        >
                          <Check className="size-4 stroke-2" aria-hidden />
                          <span className="sr-only">{c.allStaff ? "per tutti" : "assegnata"}</span>
                        </span>
                      ) : (
                        <span className="sr-only">non assegnata</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
