"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, Switch } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { removeLogo, saveStoreSettings, uploadLogo } from "./actions";

type StoreDefaults = {
  storeName: string;
  requestNoticeDays: number;
  shareIndividualMonitoring: boolean;
  leaveThresholds: Record<string, number | null>;
};

type Result = { ok: boolean; message?: string } | null;

export function StoreForm({
  defaults,
  departments,
}: {
  defaults: StoreDefaults;
  departments: { id: string; name: string }[];
}) {
  const [values, setValues] = useState(defaults);
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => setResult(await saveStoreSettings(values)));
  }

  return (
    <Card>
      <CardTitle>Negozio e regole generali</CardTitle>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Nome del negozio" htmlFor="storeName">
          <Input
            id="storeName"
            value={values.storeName}
            onChange={(e) => setValues({ ...values, storeName: e.target.value })}
          />
        </Field>
        <Field
          label="Preavviso minimo per le richieste (giorni)"
          htmlFor="notice"
          hint="Sotto questa soglia la richiesta mostra un avviso, ma si può inviare comunque."
        >
          <Input
            id="notice"
            type="number"
            min={0}
            max={90}
            className="w-32 nums"
            value={values.requestNoticeDays}
            onChange={(e) => setValues({ ...values, requestNoticeDays: Number(e.target.value) })}
          />
        </Field>
        <fieldset className="border-t border-line pt-4">
          <legend className="mb-1 eyebrow">Soglia ferie per reparto</legend>
          <p className="mb-3 text-xs text-muted">
            Nel planning ferie il giorno viene evidenziato quando le persone in ferie superano la
            soglia. Vuoto = nessuna soglia.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {departments.map((d) => (
              <Field key={d.id} label={d.name} htmlFor={`th-${d.id}`}>
                <Input
                  id={`th-${d.id}`}
                  type="number"
                  min={1}
                  className="nums"
                  value={values.leaveThresholds[d.id] ?? ""}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      leaveThresholds: {
                        ...values.leaveThresholds,
                        [d.id]: e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </fieldset>
        <div className="border-t border-line pt-2">
          <Switch
            checked={values.shareIndividualMonitoring}
            onCheckedChange={(v) => setValues({ ...values, shareIndividualMonitoring: v })}
            label="Tabelle per persona del Monitoraggio visibili a tutti"
            description="Di base i numeri dei singoli restano privati; i totali del negozio sono sempre visibili."
          />
        </div>
        <div className="flex items-center justify-end gap-4">
          <FormMessage result={result} />
          <Button type="submit" disabled={pending}>
            {pending ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  function upload(formData: FormData) {
    startTransition(async () => {
      const res = await uploadLogo(formData);
      setResult(res);
      if (res.ok) {
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardTitle>Logo</CardTitle>
      <div className="mb-6 grid min-h-28 place-items-center rounded-md border border-dashed border-line-strong p-6">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmato a scadenza
          <img src={logoUrl} alt="Logo del negozio" className="max-h-16 w-auto" />
        ) : (
          <Wordmark />
        )}
      </div>
      <form action={upload} className="flex flex-col gap-4">
        <input
          ref={inputRef}
          type="file"
          name="logo"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          className="text-sm file:mr-4 file:h-11 file:rounded-md file:border file:border-foreground file:bg-transparent file:px-4 file:text-sm"
        />
        <p className="text-xs text-muted">
          Preferibilmente in bianco e nero, PNG o SVG, massimo 2 MB. Finché non c&apos;è, si usa il
          nome del negozio in maiuscoletto.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <FormMessage result={result} />
          {logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setResult(await removeLogo());
                  router.refresh();
                })
              }
            >
              Rimuovi
            </Button>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Caricamento…" : "Carica logo"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
