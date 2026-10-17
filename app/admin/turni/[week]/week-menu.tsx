"use client";

import { Copy, LayoutTemplate, NotebookPen, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Select, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  applyWeekTemplate,
  deleteWeekTemplate,
  duplicatePreviousWeek,
  saveWeekAsTemplate,
  setWeekNote,
  setWeekRuleSet,
} from "../actions";

type Result = { ok: boolean; message?: string } | null;

/** Azioni di settimana: duplica, modelli, nota, regole. */
export function WeekMenu({
  weekId,
  weekTemplates,
  ruleSets,
  ruleSetId,
  note,
}: {
  weekId: string;
  weekTemplates: { id: string; name: string }[];
  ruleSets: { id: string; name: string; is_default: boolean }[];
  ruleSetId: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(weekTemplates[0]?.id ?? "");
  const [noteValue, setNoteValue] = useState(note ?? "");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      setResult(await fn());
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <LayoutTemplate aria-hidden /> Settimana
        </Button>
      </DialogTrigger>
      <DialogContent title="Azioni sulla settimana" wide>
        <div className="grid gap-8 md:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 eyebrow">
              <Copy className="size-4 stroke-[1.5]" aria-hidden /> Duplica
            </h3>
            <p className="text-sm text-muted">
              Copia i turni della settimana precedente nelle giornate ancora vuote. Ferie e assenze
              restano.
            </p>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => duplicatePreviousWeek(weekId))}
            >
              Duplica la settimana precedente
            </Button>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 eyebrow">
              <LayoutTemplate className="size-4 stroke-[1.5]" aria-hidden /> Modelli
            </h3>
            {weekTemplates.length > 0 ? (
              <div className="flex gap-2">
                <Select
                  aria-label="Modello"
                  className="flex-1"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  {weekTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  disabled={pending || !templateId}
                  onClick={() => run(() => applyWeekTemplate(weekId, templateId))}
                >
                  Applica
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending || !templateId}
                  onClick={() =>
                    confirm("Eliminare il modello?") && run(() => deleteWeekTemplate(templateId))
                  }
                >
                  Elimina
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted">Nessun modello salvato.</p>
            )}
            <div className="flex gap-2">
              <Input
                aria-label="Nome del modello"
                placeholder="Es. Settimana tipo autunno"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                variant="secondary"
                disabled={pending || name.trim().length < 2}
                onClick={() => run(() => saveWeekAsTemplate(weekId, name))}
              >
                Salva
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 eyebrow">
              <NotebookPen className="size-4 stroke-[1.5]" aria-hidden /> Nota per tutti
            </h3>
            <Textarea
              aria-label="Nota sulla settimana"
              placeholder="Es. Venerdì inventario dalle 19"
              value={noteValue}
              maxLength={500}
              onChange={(e) => setNoteValue(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => setWeekNote(weekId, noteValue))}
            >
              Salva nota
            </Button>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 eyebrow">
              <Scale className="size-4 stroke-[1.5]" aria-hidden /> Regole della settimana
            </h3>
            <Field label="Set di regole" htmlFor="rule-set">
              <Select
                id="rule-set"
                value={ruleSetId ?? ""}
                disabled={pending}
                onChange={(e) => run(() => setWeekRuleSet(weekId, e.target.value || null))}
              >
                <option value="">Predefinito</option>
                {ruleSets.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.is_default ? " (predefinito)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </section>
        </div>
        <div className="mt-6">
          <FormMessage result={result} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
