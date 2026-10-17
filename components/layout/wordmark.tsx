import { cn } from "@/lib/utils";

/** Wordmark testuale usato finché l'admin non carica il logo del negozio (§9). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[0.6875rem] leading-tight font-semibold tracking-[0.22em] uppercase",
        className,
      )}
    >
      Salmoiraghi &amp; Viganò
      <span className="block font-normal text-muted">Cordusio</span>
    </span>
  );
}
