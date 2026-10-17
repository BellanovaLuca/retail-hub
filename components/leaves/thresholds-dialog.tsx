"use client";

import { SlidersHorizontal } from "lucide-react";
import * as React from "react";
import { saveLeaveThresholds } from "@/app/admin/ferie/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { PlannerDepartment } from "./types";

/** Soglie per reparto: oltre questo numero di persone in ferie lo stesso giorno, la cella è rossa. */
export function ThresholdsDialog({
  departments,
  thresholds,
  onSaved,
}: {
  departments: PlannerDepartment[];
  thresholds: Record<string, number>;
  onSaved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onOpenChange = (next: boolean) => {
    if (next) {
      setValues(
        Object.fromEntries(
          departments.map((d) => [d.id, thresholds[d.id] != null ? String(thresholds[d.id]) : ""]),
        ),
      );
      setResult(null);
    }
    setOpen(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, number | null> = {};
    for (const d of departments) {
      const raw = (values[d.id] ?? "").trim();
      if (raw === "") payload[d.id] = null;
      else if (/^\d{1,2}$/.test(raw)) payload[d.id] = Number(raw);
      else {
        setResult({ ok: false, message: `Soglia non valida per ${d.name}.` });
        return;
      }
    }
    startTransition(async () => {
      const res = await saveLeaveThresholds(payload);
      setResult(res);
      if (res.ok) {
        onSaved();
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal aria-hidden /> Soglie
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Soglie per reparto"
        description="Numero massimo di persone in ferie nello stesso giorno. Oltre la soglia il conteggio in fondo al foglio diventa rosso. Vuoto = nessuna soglia."
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          {departments.map((d) => (
            <Field key={d.id} label={d.name} htmlFor={`soglia-${d.id}`}>
              <Input
                id={`soglia-${d.id}`}
                inputMode="numeric"
                placeholder="Nessuna soglia"
                value={values[d.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [d.id]: e.target.value }))}
              />
            </Field>
          ))}
          <FormMessage result={result} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              Salva soglie
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
