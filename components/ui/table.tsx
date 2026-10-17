import * as React from "react";
import { cn } from "@/lib/utils";

/** Tabella "foglio di calcolo raffinato": righe sottili, intestazioni in maiuscoletto grigio (§9). */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className={cn("w-full border-collapse text-sm nums", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-line px-3 py-2.5 text-left eyebrow font-semibold whitespace-nowrap first:pl-0",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("border-b border-line px-3 py-3 align-middle first:pl-0", className)}
      {...props}
    />
  );
}

/** Pallino del colore personale accanto al nome (§9). */
export function PersonDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full bg-line-strong", className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
