import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { FieldError, Label } from "./input";

/** Etichetta + controllo + errore + aiuto, impilati. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-subtle focus-visible:border-foreground aria-invalid:border-danger sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        className="h-11 w-full appearance-none rounded-md border border-line-strong bg-background pr-9 pl-3 text-base outline-none focus-visible:border-foreground aria-invalid:border-danger sm:text-sm"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 stroke-[1.5] text-muted"
        aria-hidden
      />
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: React.ReactNode; description?: string }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-foreground" {...props} />
      <span>
        {label}
        {description ? (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  name,
  id: explicitId,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  name?: string;
  /** Id stabile: utile dentro Controller di react-hook-form, dove useId può divergere tra server e client. */
  id?: string;
}) {
  const generatedId = React.useId();
  const id = explicitId ?? generatedId;
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="text-sm">
        {label}
        {description ? (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        ) : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        name={name}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-150 disabled:opacity-40",
          checked ? "border-foreground bg-foreground" : "border-line-strong bg-transparent",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 left-0.5 size-[1.125rem] rounded-full transition-transform duration-150",
            checked ? "translate-x-4 bg-background" : "bg-line-strong",
          )}
        />
      </button>
    </div>
  );
}

/** Messaggio di esito sotto un form. */
export function FormMessage({ result }: { result: { ok: boolean; message?: string } | null }) {
  if (!result?.message) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={cn("text-sm", result.ok ? "text-success" : "text-danger")}
    >
      {result.message}
    </p>
  );
}
