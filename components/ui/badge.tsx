import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.06em]",
  {
    variants: {
      tone: {
        neutral: "border-line-strong text-muted",
        solid: "border-foreground bg-foreground text-background",
        danger: "border-danger/40 text-danger",
        success: "border-success/40 text-success",
        warning: "border-warning/40 text-warning",
        vista: "border-vista/30 bg-vista/10 text-vista-ink",
        sole: "border-sole/40 bg-sole/10 text-sole-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
