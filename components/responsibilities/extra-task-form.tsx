"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { createExtraTask } from "@/app/admin/comunicazioni/responsabilita/actions";
import { PeoplePicker, type PickerPerson } from "@/components/announcements/people-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/** Nuova attività extra (compito una tantum): titolo, descrizione, scadenza, assegnatari. */
export function ExtraTaskForm({ people, today }: { people: PickerPerson[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createExtraTask({ title, description, dueDate, assigneeIds });
      setErrors(!res.ok && res.fieldErrors ? res.fieldErrors : {});
      setResult(res);
      if (res.ok) {
        setTitle("");
        setDescription("");
        setDueDate("");
        setAssigneeIds([]);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Plus aria-hidden /> Nuova attività extra
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuova attività extra"
        description="Un compito una tantum: compare in «Oggi tocca a te» degli assegnatari finché qualcuno non lo chiude."
        wide
      >
        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <Field label="Titolo" htmlFor="extra-titolo" error={errors.title}>
            <Input
              id="extra-titolo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!errors.title}
              placeholder="es. Inventario espositori sole"
            />
          </Field>
          <Field label="Descrizione" htmlFor="extra-descrizione" error={errors.description}>
            <Textarea
              id="extra-descrizione"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Scadenza (facoltativa)" htmlFor="extra-scadenza" error={errors.dueDate}>
            <Input
              id="extra-scadenza"
              type="date"
              min={today}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="max-w-52"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Assegnatari</p>
            <PeoplePicker
              people={people}
              value={assigneeIds}
              onChange={setAssigneeIds}
              label="Assegnatari"
            />
            {errors.assigneeIds ? (
              <p role="alert" className="text-sm text-danger">
                {errors.assigneeIds}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio…" : "Crea e notifica"}
            </Button>
            <FormMessage result={result} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
