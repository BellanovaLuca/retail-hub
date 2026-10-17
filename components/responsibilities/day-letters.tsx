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
