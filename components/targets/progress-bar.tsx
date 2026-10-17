import { cn } from "@/lib/utils";

/** Sottile barra di avanzamento nera (§6.1): 0…1, piena quando l'obiettivo è raggiunto. */
export function ProgressBar({
  ratio,
  label,
  className,
}: {
  ratio: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("h-0.5 w-full overflow-hidden bg-line", className)}
    >
      <div
        className="h-full bg-foreground transition-[width] duration-200 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
