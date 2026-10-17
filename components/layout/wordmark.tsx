import { cn } from "@/lib/utils";

/** Wordmark testuale, sostituito dal logo del negozio quando l'admin lo carica (§9). */
export function Wordmark({
  className,
  logo,
}: {
  className?: string;
  logo?: { url: string; name: string } | null;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmato di Storage, non ottimizzabile
      <img
        src={logo.url}
        alt={logo.name}
        className={cn("block h-8 w-auto max-w-[11rem] object-contain object-left", className)}
      />
    );
  }
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
