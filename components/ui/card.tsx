import * as React from "react";
import { cn } from "@/lib/utils";

/** Card con solo il bordo, niente ombre (§9). */
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-lg border border-line p-5 sm:p-6", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("mb-4 eyebrow", className)} {...props} />;
}
