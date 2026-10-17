"use client";

import { useState, useTransition } from "react";
import { PushToggle } from "@/components/notifications/push-toggle";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Switch } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { saveNotificationSettings } from "@/lib/notifications/actions";

export function NotificationSettings({
  vapidPublicKey,
  initial,
}: {
  vapidPublicKey: string | null;
  initial: {
    push: boolean;
    email: boolean;
    shift_reminder: boolean;
    emailAddress: string;
    phone: string;
  };
}) {
  const [prefs, setPrefs] = useState({
    push: initial.push,
    email: initial.email,
    shift_reminder: initial.shift_reminder,
  });
  const [email, setEmail] = useState(initial.emailAddress);
  const [phone, setPhone] = useState(initial.phone);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <PushToggle vapidPublicKey={vapidPublicKey} />
      <div className="divide-y divide-line border-y border-line">
        <Switch
          checked={prefs.push}
          onCheckedChange={(v) => setPrefs({ ...prefs, push: v })}
          label="Notifiche push"
          description="Orari pubblicati, richieste, comunicazioni, promemoria."
        />
        <Switch
          checked={prefs.shift_reminder}
          onCheckedChange={(v) => setPrefs({ ...prefs, shift_reminder: v })}
          label="Promemoria turno"
          description="La sera prima di ogni turno."
        />
        <Switch
          checked={prefs.email}
          onCheckedChange={(v) => setPrefs({ ...prefs, email: v })}
          label="Anche via email"
          description="Solo per orari, modifiche e decisioni sulle richieste."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email (facoltativa)" htmlFor="ns-email">
          <Input
            id="ns-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Telefono (facoltativo)" htmlFor="ns-phone">
          <Input
            id="ns-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3">
        <FormMessage result={result} />
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () =>
              setResult(await saveNotificationSettings({ prefs, email, phone })),
            )
          }
        >
          Salva preferenze
        </Button>
      </div>
    </div>
  );
}
