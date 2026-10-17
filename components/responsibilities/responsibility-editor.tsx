"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteResponsibility,
  saveResponsibility,
  type ResponsibilityInput,
} from "@/app/admin/comunicazioni/responsabilita/actions";
import { AttachmentsField } from "@/components/announcements/attachments-field";
import { Markdown } from "@/components/announcements/markdown";
import type { PickerPerson } from "@/components/announcements/people-picker";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Select, Switch, Textarea } from "@/components/ui/form";
import { Input, Label } from "@/components/ui/input";
import { PersonDot } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DAY_LETTERS, DAY_NAMES } from "./format";

export type ResponsibilityValue = Required<ResponsibilityInput>;

const BASE = "/admin/comunicazioni/responsabilita";

/** Crea o modifica un'attività: come si fa, giorni previsti, responsabile e supporti. */
export function ResponsibilityEditor({
  initial,
  isNew,
  people,
}: {
  initial: ResponsibilityValue;
  isNew: boolean;
  people: PickerPerson[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ResponsibilityValue>(k: K, value: ResponsibilityValue[K]) =>
    setV((prev) => ({ ...prev, [k]: value }));
  const byId = new Map(people.map((p) => [p.id, p]));

  function toggleDay(day: number) {
    set(
      "scheduleDays",
      v.scheduleDays.includes(day)
        ? v.scheduleDays.filter((d) => d !== day)
        : [...v.scheduleDays, day].sort(),
    );
  }

  function moveSupport(i: number, delta: number) {
    const next = [...v.supportIds];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set("supportIds", next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveResponsibility(v);
      setErrors(!res.ok && res.fieldErrors ? res.fieldErrors : {});
      setResult(res);
      if (res.ok) {
        router.push(BASE);
        router.refresh();
      }
    });
  }

  function remove() {
    if (
      !window.confirm(
        "Eliminare l'attività con tutto lo storico delle spunte? Per conservarlo, disattivala.",
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteResponsibility(v.id);
      setResult(res);
      if (res.ok) {
        router.push(BASE);
        router.refresh();
      }
    });
  }

  const supportCandidates = people.filter(
    (p) => p.id !== v.ownerId && !v.supportIds.includes(p.id),
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-10" noValidate>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Field label="Attività" htmlFor="titolo" error={errors.title}>
          <Input
            id="titolo"
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
            aria-invalid={!!errors.title}
            placeholder="es. Controllo mail annulli WO e Smartly"
          />
        </Field>
        <div className="flex flex-col justify-end">
          <Switch
            label="Attiva"
            description="Le disattivate spariscono dal tabellone ma restano nello storico."
            checked={v.active}
            onCheckedChange={(x) => set("active", x)}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-3 eyebrow">Giorni previsti</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_LETTERS.map((letter, i) => {
            const day = i + 1;
            const on = v.scheduleDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={DAY_NAMES[i]}
                title={DAY_NAMES[i]}
                onClick={() => toggleDay(day)}
                className={cn(
                  "grid size-11 place-items-center rounded-md border text-sm font-semibold",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-line-strong text-muted hover:border-foreground",
                )}
              >
                {letter}
              </button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11"
            onClick={() => set("scheduleDays", [1, 2, 3, 4, 5, 6, 7])}
          >
            Tutti i giorni
          </Button>
        </div>
        {errors.scheduleDays ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {errors.scheduleDays}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-3 eyebrow">Chi se ne occupa</legend>
        <Switch
          label="Per tutti"
          description="Come «Ordini da fare»: chiunque sia in turno può spuntarla."
          checked={v.allStaff}
          onCheckedChange={(x) => set("allStaff", x)}
        />
        {!v.allStaff ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <Field
              label="Responsabile"
              htmlFor="responsabile"
              error={errors.ownerId}
              hint="Il nome in grassetto del tabellone."
            >
              <Select
                id="responsabile"
                value={v.ownerId ?? ""}
                aria-invalid={!!errors.ownerId}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setV((prev) => ({
                    ...prev,
                    ownerId: id,
                    supportIds: prev.supportIds.filter((s) => s !== id),
                  }));
                }}
              >
                <option value="">— Scegli —</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.hint ? ` · ${p.hint}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-2">
              <Label htmlFor="supporto">Supporto</Label>
              <p className="text-xs text-muted">
                In ordine: se il responsabile non è in turno, l&apos;attività passa al primo
                supporto in turno.
              </p>
              {v.supportIds.length > 0 ? (
                <ol className="border-t border-line">
                  {v.supportIds.map((id, i) => {
                    const p = byId.get(id);
                    return (
                      <li
                        key={id}
                        className="flex min-h-11 items-center gap-2 border-b border-line text-sm"
                      >
                        <span className="w-5 text-xs text-muted nums">{i + 1}.</span>
                        <PersonDot color={p?.color ?? null} />
                        <span className="flex-1">{p?.name ?? "—"}</span>
                        <button
                          type="button"
                          onClick={() => moveSupport(i, -1)}
                          disabled={i === 0}
                          className="grid size-9 place-items-center rounded-sm text-muted hover:bg-surface disabled:opacity-30"
                          aria-label={`Sposta ${p?.name} prima`}
                        >
                          <ArrowUp className="size-4 stroke-[1.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSupport(i, 1)}
                          disabled={i === v.supportIds.length - 1}
                          className="grid size-9 place-items-center rounded-sm text-muted hover:bg-surface disabled:opacity-30"
                          aria-label={`Sposta ${p?.name} dopo`}
                        >
                          <ArrowDown className="size-4 stroke-[1.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "supportIds",
                              v.supportIds.filter((x) => x !== id),
                            )
                          }
                          className="grid size-9 place-items-center rounded-sm text-muted hover:bg-surface hover:text-foreground"
                          aria-label={`Togli ${p?.name} dal supporto`}
                        >
                          <X className="size-4 stroke-[1.5]" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              <Select
                id="supporto"
                value=""
                onChange={(e) => {
                  if (e.target.value) set("supportIds", [...v.supportIds, e.target.value]);
                }}
              >
                <option value="">+ Aggiungi una persona di supporto</option>
                {supportCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.hint ? ` · ${p.hint}` : ""}
                  </option>
                ))}
              </Select>
              {errors.supportIds ? (
                <p role="alert" className="text-sm text-danger">
                  {errors.supportIds}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-2">
        <Field
          label="Come si fa"
          htmlFor="descrizione"
          error={errors.description}
          hint="Procedura, link, contatti. **grassetto**, - elenco, [testo](https://…)"
        >
          <Textarea
            id="descrizione"
            value={v.description}
            onChange={(e) => set("description", e.target.value)}
            className="min-h-64 font-mono text-sm"
          />
        </Field>
        <div className="flex flex-col gap-2">
          <Label>Anteprima</Label>
          <div className="min-h-64 rounded-md border border-line p-4">
            {v.description.trim() ? (
              <Markdown source={v.description} className="text-sm" />
            ) : (
              <p className="text-sm text-subtle">L&apos;anteprima comparirà qui.</p>
            )}
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="mb-3 eyebrow">Allegati (facoltativi)</legend>
        <AttachmentsField
          value={v.attachments}
          onChange={(a) => set("attachments", a)}
          folder={`responsibilities/${v.id}`}
          disabled={pending}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : isNew ? "Crea attività" : "Salva modifiche"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(BASE)}>
          Annulla
        </Button>
        {!isNew ? (
          <Button
            type="button"
            variant="danger"
            className="ml-auto"
            onClick={remove}
            disabled={pending}
          >
            Elimina
          </Button>
        ) : null}
        <div className="basis-full">
          <FormMessage result={result} />
        </div>
      </div>
    </form>
  );
}
