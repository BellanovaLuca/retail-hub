"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

const schema = z.object({
  code: z.string().trim().min(2, "Inserisci il tuo codice dipendente."),
  pin: z.string().regex(/^\d{6,12}$/, "Il PIN è fatto di sole cifre (almeno 6)."),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setServerError(body.error ?? "Accesso non riuscito.");
        return;
      }
      router.replace(body.redirectTo === "/" ? next : (body.redirectTo ?? next));
      router.refresh();
    } catch {
      setServerError("Connessione assente. Riprova.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Codice dipendente</Label>
        <Input
          id="code"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="CRD-014"
          aria-invalid={Boolean(errors.code)}
          className="uppercase placeholder:normal-case"
          {...register("code")}
        />
        <FieldError>{errors.code?.message}</FieldError>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pin">PIN</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.pin)}
          className="tracking-[0.3em] nums"
          {...register("pin")}
        />
        <FieldError>{errors.pin?.message}</FieldError>
      </div>
      <FieldError>{serverError}</FieldError>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Accesso in corso…" : "Entra"}
      </Button>
    </form>
  );
}
