import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { PersonDot } from "@/components/ui/table";
import type { PersonDays } from "@/lib/responsibilities/assignment";
import { cn } from "@/lib/utils";

export type DayGridItem = { id: string; title: string; personDays: PersonDays };

/**
 * «Chi fa cosa, giorno per giorno»: le persone in riga, i sette giorni in colonna e in ogni
 * casella le responsabilità di quella persona in quel giorno. Sola lettura: la vedono tutti
 * (con la propria riga evidenziata); nell'area admin i nomi delle attività si possono cliccare
 * per aprirne l'assegnazione.
 */
export function WeekDayGrid({
  days,
  today,
  people,
  items,
  highlightId,
  viewerId,
  caption,
  selectedId,
  onPick,
  onShift,
}: {
  /** Le sette date della settimana, da lunedì. */
  days: string[];
  today?: string;
  people: { id: string; name: string; color: string | null }[];
  items: DayGridItem[];
  highlightId?: string;
  viewerId?: string;
  caption: string;
  /** Attività evidenziata (quella aperta nell'assegnazione). */
  selectedId?: string | null;
  onPick?: (id: string) => void;
  /** Per data: chi è in turno (null = turni non pubblicati). Segnala chi è assegnato ma assente. */
  onShift?: Record<string, string[] | null>;
}) {
  return (
    // Area scorrevole raggiungibile da tastiera anche quando non contiene pulsanti.
    <div
      className="relative overflow-x-auto rounded-md border border-line focus-visible:outline-2 focus-visible:outline-foreground"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="w-full min-w-[46rem] table-fixed border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-36 border-b border-line bg-background px-3 py-2 text-left align-bottom eyebrow font-semibold"
            >
              Persona
            </th>
            {days.map((d) => (
              <th
                key={d}
                scope="col"
                aria-current={d === today ? "date" : undefined}
                className={cn(
                  "border-b border-l border-line px-2 py-2 text-left align-bottom eyebrow font-semibold whitespace-nowrap",
                  d === today && "border-t-[3px] border-t-foreground text-foreground",
                )}
              >
                {format(parseISO(d), "EEE d", { locale: it })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const mine = p.id === highlightId;
            return (
              <tr key={p.id} className={cn(mine && "bg-foreground/[0.05]")}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 border-b border-line px-3 py-2 text-left align-top",
                    mine
                      ? "bg-surface font-semibold shadow-[inset_3px_0_0_var(--foreground)]"
                      : "bg-background font-normal",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <PersonDot color={p.color} />
                    <span className="min-w-0 truncate">{p.name}</span>
                    {mine && p.id === viewerId ? (
                      <span className="eyebrow text-[0.625rem]">tu</span>
                    ) : null}
                  </span>
                </th>
                {days.map((d, i) => {
                  const mineToday = items.filter((r) => r.personDays[p.id]?.includes(i + 1));
                  const shift = onShift?.[d];
                  const away = !!shift && !shift.includes(p.id);
                  return (
                    <td
                      key={d}
                      className={cn(
                        "border-b border-l border-line p-1 align-top",
                        d === today && "bg-surface/50",
                      )}
                    >
                      {mineToday.length === 0 ? (
                        <span className="sr-only">nessuna attività</span>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {mineToday.map((r) => {
                            const cls = cn(
                              "block w-full rounded-sm px-1.5 py-1 text-left text-xs leading-snug",
                              r.id === selectedId
                                ? "bg-foreground text-background"
                                : away
                                  ? "bg-danger/10 text-danger"
                                  : "bg-foreground/[0.06]",
                            );
                            const note = away ? " (non in turno)" : "";
                            return (
                              <li key={r.id}>
                                {onPick ? (
                                  <button
                                    type="button"
                                    className={cn(cls, "hover:bg-foreground hover:text-background")}
                                    title={`${r.title}${note} · apri l'assegnazione`}
                                    onClick={() => onPick(r.id)}
                                  >
                                    {r.title}
                                    {away ? <span className="sr-only">{note}</span> : null}
                                  </button>
                                ) : (
                                  <span className={cls} title={away ? `${r.title}${note}` : undefined}>
                                    {r.title}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
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
