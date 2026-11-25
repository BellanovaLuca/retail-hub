import { cn } from "@/lib/utils";
import { DAY_LETTERS, scheduleLabel } from "./format";

/** Giorni previsti come lettere L M M G V S D (pieni = previsti). */
export function DayLetters({ days, className }: { days: number[]; className?: string }) {
  return (
    <span
      role="img"
      className={cn("inline-flex gap-0.5", className)}
      aria-label={scheduleLabel(days)}
    >
      {DAY_LETTERS.map((letter, i) => {
        const on = days.includes(i + 1);
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "grid size-5 place-items-center rounded-sm text-[0.625rem] font-semibold",
              on ? "bg-foreground text-background" : "border border-line text-subtle",
            )}
          >
            {letter}
          </span>
        );
      })}
    </span>
  );
}

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
