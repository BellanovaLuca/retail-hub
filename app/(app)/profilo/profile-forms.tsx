"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { changePin, setTheme, signOut, signOutEverywhere } from "@/lib/auth/actions";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ChangePinForm({ pinHint }: { pinHint: string }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await changePin({ pin, confirm });
      if (result.ok) {
        setPin("");
        setConfirm("");
        setMessage({ ok: true, text: "PIN aggiornato." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted">Il PIN deve avere {pinHint}.</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-pin">Nuovo PIN</Label>
        <Input
          id="new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="tracking-[0.3em] nums"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-pin">Ripeti il PIN</Label>
        <Input
          id="confirm-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="tracking-[0.3em] nums"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      {message?.ok ? (
        <p role="status" className="text-sm text-success">
          {message.text}
        </p>
      ) : (
        <FieldError>{message?.text}</FieldError>
      )}
      <Button type="submit" variant="secondary" disabled={pending || !pin || !confirm}>
        {pending ? "Salvataggio…" : "Aggiorna PIN"}
      </Button>
    </form>
  );
}

const themes: { value: Theme; label: string }[] = [
  { value: "sistema", label: "Sistema" },
  { value: "chiaro", label: "Chiaro" },
  { value: "scuro", label: "Scuro" },
];

export function ThemePicker({ current }: { current: Theme }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [, startTransition] = useTransition();

  function choose(theme: Theme) {
    setValue(theme);
    startTransition(async () => {
      await setTheme(theme);
      router.refresh();
    });
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 border border-foreground">
      {themes.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={value === t.value}
          onClick={() => choose(t.value)}
          className={cn(
            "min-h-11 text-sm transition-colors not-last:border-r not-last:border-foreground",
            value === t.value ? "bg-foreground text-background" : "hover:bg-surface",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SessionActions() {
  return (
    <div className="flex flex-col gap-3">
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Esci
        </Button>
      </form>
      <form action={signOutEverywhere}>
        <Button type="submit" variant="ghost" className="w-full text-muted">
          Esci da tutti i dispositivi
        </Button>
      </form>
    </div>
  );
}
