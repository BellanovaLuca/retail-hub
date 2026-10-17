import * as React from "react";
import { cn } from "@/lib/utils";

/** Stato vuoto tipografico: una frase in grande, grigia (§9). */
export function EmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-16 sm:py-24", className)}>
      <p className="max-w-xl font-display text-2xl leading-snug font-light text-subtle sm:text-3xl">
        {title}
      </p>
      {children ? <div className="mt-4 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-surface", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-3 sm:mb-14">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="font-display text-4xl font-light tracking-tight sm:text-[2.75rem] sm:leading-[1.1]">
        {title}
      </h1>
      {children ? <div className="text-muted">{children}</div> : null}
    </header>
  );
}
