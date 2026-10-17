"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAnnouncement, saveAnnouncement } from "@/app/admin/comunicazioni/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Select, Switch, Textarea } from "@/components/ui/form";
import { Input, Label } from "@/components/ui/input";
import {
  CATEGORIES,
  audienceLabels,
  categoryLabels,
  type AnnouncementInput,
  type Audience,
} from "@/lib/announcements/model";
import { cn } from "@/lib/utils";
import { AttachmentsField } from "./attachments-field";
import { Markdown } from "./markdown";
import { PeoplePicker, type PickerPerson } from "./people-picker";

export type EditorValue = Required<Pick<AnnouncementInput, "id">> & Omit<AnnouncementInput, "id">;

const MD_HELP = "**grassetto**, *corsivo*, ## titolo, - elenco, [testo](https://…)";

/** Editor delle comunicazioni: markdown con anteprima affiancata, destinatari, programmazione. */
export function AnnouncementEditor({
  initial,
  isNew,
  alreadyPublished,
  departments,
  people,
}: {
  initial: EditorValue;
  isNew: boolean;
  alreadyPublished: boolean;
  departments: { id: string; name: string }[];
  people: PickerPerson[];
}) {
  const router = useRouter();
  const [v, setV] = useState<EditorValue>(initial);
  const [schedule, setSchedule] = useState(!!initial.publishAt && !alreadyPublished);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof EditorValue>(key: K, value: EditorValue[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setResult(null);
      const payload: AnnouncementInput = {
        ...v,
        // "Subito": per una nuova vale adesso; per una già pubblicata resta la data originale.
        publishAt: schedule || alreadyPublished ? v.publishAt : "",
      };
      const res = await saveAnnouncement(payload);
      setErrors(!res.ok && res.fieldErrors ? res.fieldErrors : {});
      setResult(res);
      if (res.ok) {
        router.push("/admin/comunicazioni");
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm("Eliminare questa comunicazione? Le letture registrate andranno perse.")) return;
    startTransition(async () => {
      const res = await deleteAnnouncement(v.id);
      setResult(res);
      if (res.ok) {
        router.push("/admin/comunicazioni");
        router.refresh();
      }
    });
  }

  const submitLabel = alreadyPublished
    ? "Salva modifiche"
    : schedule
      ? "Programma"
      : "Pubblica ora";

  return (
    <form onSubmit={submit} className="flex flex-col gap-10" noValidate>
      <Field label="Titolo" htmlFor="titolo" error={errors.title}>
        <Input
          id="titolo"
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          aria-invalid={!!errors.title}
          maxLength={200}
          required
        />
      </Field>

      <div className="grid gap-6 lg:grid-cols-2">
        <Field label="Testo" htmlFor="testo" error={errors.body} hint={MD_HELP}>
          <Textarea
            id="testo"
            value={v.body}
            onChange={(e) => set("body", e.target.value)}
            className="min-h-80 font-mono text-sm"
          />
        </Field>
        <div className="flex flex-col gap-2">
          <Label>Anteprima</Label>
          <div className="min-h-80 rounded-md border border-line p-4" aria-live="polite">
            {v.body.trim() ? (
              <Markdown source={v.body} />
            ) : (
              <p className="text-sm text-subtle">L&apos;anteprima comparirà qui.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Field label="Categoria" htmlFor="categoria">
            <Select
              id="categoria"
              value={v.category}
              onChange={(e) => set("category", e.target.value as EditorValue["category"])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </Select>
          </Field>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 eyebrow">Destinatari</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Destinatari">
              {(Object.keys(audienceLabels) as Audience[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={v.audience === a}
                  onClick={() => set("audience", a)}
                  className={cn(
                    "h-9 rounded-md border px-3 text-sm",
                    v.audience === a
                      ? "border-foreground bg-foreground text-background"
                      : "border-line-strong hover:border-foreground",
                  )}
                >
                  {audienceLabels[a]}
                </button>
              ))}
            </div>
            {v.audience === "department" ? (
              <div>
                {departments.map((d) => (
                  <label key={d.id} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-foreground"
                      checked={v.departmentIds.includes(d.id)}
                      onChange={(e) =>
                        set(
                          "departmentIds",
                          e.target.checked
                            ? [...v.departmentIds, d.id]
                            : v.departmentIds.filter((x) => x !== d.id),
                        )
                      }
                    />
                    {d.name}
                  </label>
                ))}
                {errors.departmentIds ? (
                  <p role="alert" className="text-sm text-danger">
                    {errors.departmentIds}
                  </p>
                ) : null}
              </div>
            ) : null}
            {v.audience === "people" ? (
              <div>
                <PeoplePicker
                  people={people}
                  value={v.profileIds}
                  onChange={(ids) => set("profileIds", ids)}
                  label="Destinatari"
                />
                {errors.profileIds ? (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {errors.profileIds}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <div className="border-t border-line pt-2">
            <Switch
              label="Fissa in alto"
              description="Resta in cima alla bacheca."
              checked={v.pinned}
              onCheckedChange={(x) => set("pinned", x)}
            />
            <Switch
              label="Richiede conferma di lettura"
              description="I destinatari devono premere «Ho letto»."
              checked={v.requiresAck}
              onCheckedChange={(x) => set("requiresAck", x)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 eyebrow">Pubblicazione</legend>
            {alreadyPublished ? (
              <Field label="Pubblicata il" htmlFor="pubblica" error={errors.publishAt}>
                <Input
                  id="pubblica"
                  type="datetime-local"
                  value={v.publishAt}
                  onChange={(e) => set("publishAt", e.target.value)}
                />
              </Field>
            ) : (
              <>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="quando"
                    className="size-4 accent-foreground"
                    checked={!schedule}
                    onChange={() => setSchedule(false)}
                  />
                  Subito
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="quando"
                    className="size-4 accent-foreground"
                    checked={schedule}
                    onChange={() => setSchedule(true)}
                  />
                  Programma per una data e un&apos;ora
                </label>
                {schedule ? (
                  <Field
                    label="Data e ora di pubblicazione"
                    htmlFor="pubblica"
                    error={errors.publishAt}
                    hint="Ora italiana. I destinatari ricevono la notifica a quell'ora."
                  >
                    <Input
                      id="pubblica"
                      type="datetime-local"
                      value={v.publishAt}
                      onChange={(e) => set("publishAt", e.target.value)}
                      aria-invalid={!!errors.publishAt}
                    />
                  </Field>
                ) : null}
              </>
            )}
          </fieldset>

          <Field
            label="Scadenza (facoltativa)"
            htmlFor="scadenza"
            error={errors.expiresAt}
            hint="Dopo questa data la comunicazione sparisce dalla bacheca."
          >
            <Input
              id="scadenza"
              type="datetime-local"
              value={v.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              aria-invalid={!!errors.expiresAt}
            />
          </Field>

          <fieldset>
            <legend className="mb-3 eyebrow">Allegati</legend>
            <AttachmentsField
              value={v.attachments}
              onChange={(a) => set("attachments", a)}
              folder={`announcements/${v.id}`}
              disabled={pending}
            />
          </fieldset>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/comunicazioni")}>
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
