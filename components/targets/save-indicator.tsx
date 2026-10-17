import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** Indicatore discreto "Salvato" del salvataggio automatico. */
export function SaveIndicator({
  status,
  error,
  className,
}: {
  status: SaveStatus;
  error?: string | null;
  className?: string;
}) {
  if (status === "idle") return <span className={cn("text-xs", className)} aria-hidden />;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        status === "error" ? "text-danger" : "text-muted",
        className,
      )}
    >
      {status === "saved" ? (
        <>
          <Check className="size-3.5 stroke-[1.5]" aria-hidden /> Salvato
        </>
      ) : status === "error" ? (
        <>
          <TriangleAlert className="size-3.5 stroke-[1.5]" aria-hidden /> {error ?? "Non salvato"}
        </>
      ) : (
        <>
          <LoaderCircle className="size-3.5 animate-spin stroke-[1.5]" aria-hidden /> Salvataggio…
        </>
      )}
    </span>
  );
}
