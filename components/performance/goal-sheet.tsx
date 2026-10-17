"use client";

import { Copy, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  copyFromPreviousPeriod,
  publishGoals,
  saveGoalSheet,
  unpublishGoals,
} from "@/app/admin/performance/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Select, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  PILLARS,
  PROGRESS_LABELS,
  PROGRESS_VALUES,
  isGoalDefined,
  slotCode,
  slotKey,
  type Pillar,
  type Progress,
} from "@/lib/performance/goals";
import { cn } from "@/lib/utils";
import { DepartmentDialog } from "./period-actions";

export type SheetGoal = {
  pillar: Pillar;
  slot: number;
  title: string;
  objective: string;
  progress: Progress | null;
  comment: string;
  privateNote: string;
  employeeNote: string | null;
  published: boolean;
};

type Result = { ok: boolean; message?: string } | null;

/** Scheda di una persona: i 6 spazi (3 Achievement + 3 Leadership) con salvataggio e pubblicazione. */
export function GoalSheet({
  year,
  profileId,
  displayName,
  department,
  departments,
  goals: initialGoals,
}: {
  year: number;
  profileId: string;
  displayName: string;
  department: { id: string; name: string } | null;
  departments: { id: string; name: string }[];
  goals: SheetGoal[];
}) {
  const router = useRouter();
  const [goals, setGoals] = React.useState(initialGoals);
  const [dirty, setDirty] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);
  const [pending, startTransition] = React.useTransition();

  // Dopo un salvataggio o una copia il server rimanda i dati: si riparte da quelli.
  const [last, setLast] = React.useState(initialGoals);
  if (last !== initialGoals) {
    setLast(initialGoals);
    setGoals(initialGoals);
    setDirty(false);
  }

  const update = (key: string, patch: Partial<SheetGoal>) => {
    setDirty(true);
    setGoals((list) =>
      list.map((g) => (slotKey(g.pillar, g.slot) === key ? { ...g, ...patch } : g)),
    );
  };

  const payload = () => ({
    year,
    profileId,
    goals: goals.map((g) => ({
      pillar: g.pillar,
      slot: g.slot,
      title: g.title,
      objective: g.objective,
      progress: g.progress,
      comment: g.comment,
      privateNote: g.privateNote,
    })),
  });

  const save = () =>
    startTransition(async () => {
      const res = await saveGoalSheet(payload());
      setResult(res);
      if (res.ok) setDirty(false);
      router.refresh();
    });

  const publish = () =>
    startTransition(async () => {
      if (dirty) {
        const saved = await saveGoalSheet(payload());
        if (!saved.ok) {
          setResult(saved);
          return;
        }
        setDirty(false);
      }
      setResult(await publishGoals({ year, profileId }));
      router.refresh();
    });

  const copy = () =>
    startTransition(async () => {
      setResult(await copyFromPreviousPeriod({ year, profileId }));
      router.refresh();
    });

  const unpublish = () =>
    startTransition(async () => {
      setResult(await unpublishGoals({ year, profileId }));
      router.refresh();
    });

  const defined = goals.filter(isGoalDefined);
  const toPublish = defined.filter((g) => !g.published).length;
  const anyPublished = goals.some((g) => g.published);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-10"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={copy}>
          <Copy aria-hidden /> Copia dal {year - 1}
        </Button>
        {anyPublished ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={unpublish}>
            Ritira pubblicazione
          </Button>
        ) : null}
        <span className="ml-auto text-sm text-muted nums">
          {defined.length} di 6 definiti · {defined.length - toPublish} pubblicati
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        {PILLARS.map((pillar) => (
          <section key={pillar.id} aria-label={pillar.label} className="flex flex-col gap-6">
            <h2 className="border-b border-foreground pb-2 eyebrow text-foreground">
              {pillar.label}
            </h2>
            {goals
              .filter((g) => g.pillar === pillar.id)
              .map((g) => {
                const key = slotKey(g.pillar, g.slot);
                const code = slotCode(g.pillar, g.slot);
                const id = `goal-${code}`;
                return (
                  <fieldset
                    key={key}
                    id={code}
                    className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line p-5 target:border-foreground"
                  >
                    <legend className="-ml-1 px-1 font-display text-sm font-semibold tracking-[0.08em]">
                      {code}
                      {g.published ? (
                        <Badge tone="solid" className="ml-2 align-middle">
                          Pubblicato
                        </Badge>
                      ) : isGoalDefined(g) ? (
                        <Badge className="ml-2 align-middle">Non pubblicato</Badge>
                      ) : null}
                    </legend>
                    <Field label="Titolo" htmlFor={`${id}-title`}>
                      <Input
                        id={`${id}-title`}
                        value={g.title}
                        maxLength={120}
                        placeholder="es. Lenti progressive"
                        onChange={(e) => update(key, { title: e.target.value })}
                      />
                    </Field>
                    <Field label="Obiettivo" htmlFor={`${id}-objective`}>
                      <Textarea
                        id={`${id}-objective`}
                        value={g.objective}
                        maxLength={2000}
                        onChange={(e) => update(key, { objective: e.target.value })}
                      />
                    </Field>
                    <Field label="Stato" htmlFor={`${id}-progress`}>
                      <Select
                        id={`${id}-progress`}
                        value={g.progress ?? ""}
                        onChange={(e) =>
                          update(key, { progress: (e.target.value || null) as Progress | null })
                        }
                      >
                        <option value="">—</option>
                        {PROGRESS_VALUES.map((p) => (
                          <option key={p} value={p}>
                            {PROGRESS_LABELS[p]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Commento"
                      htmlFor={`${id}-comment`}
                      hint="Visibile al dipendente dopo la pubblicazione."
                    >
                      <Textarea
                        id={`${id}-comment`}
                        value={g.comment}
                        maxLength={2000}
                        className="min-h-20"
                        onChange={(e) => update(key, { comment: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Nota privata"
                      htmlFor={`${id}-private`}
                      hint="Solo per i responsabili: il dipendente non la vede mai."
                    >
                      <Textarea
                        id={`${id}-private`}
                        value={g.privateNote}
                        maxLength={2000}
                        className="min-h-16 bg-surface/60"
                        onChange={(e) => update(key, { privateNote: e.target.value })}
                      />
                    </Field>
                    <div>
                      <p className="mb-2 eyebrow">Nota del dipendente</p>
                      <p
                        className={cn(
                          "border-l-2 border-line pl-3 text-sm whitespace-pre-line",
                          !g.employeeNote && "text-subtle",
                        )}
                      >
                        {g.employeeNote || "Nessuna nota."}
                      </p>
                    </div>
                    {department ? (
                      <DepartmentDialog
                        year={year}
                        departments={departments}
                        initial={{
                          departmentId: department.id,
                          pillar: g.pillar,
                          slot: g.slot,
                          title: g.title,
                          objective: g.objective,
                        }}
                        onDone={(res) => {
                          setResult(res);
                          router.refresh();
                        }}
                        trigger={
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            disabled={!isGoalDefined(g)}
                            className="self-start text-muted"
                          >
                            <Users aria-hidden /> Applica a tutto il reparto {department.name}
                          </Button>
                        }
                      />
                    ) : null}
                  </fieldset>
                );
              })}
          </section>
        ))}
      </div>

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 border border-foreground bg-background p-4">
        <p className="mr-auto text-sm text-muted">
          {dirty ? "Modifiche non salvate." : `Scheda di ${displayName}.`}
        </p>
        <FormMessage result={result} />
        <Button type="submit" variant="secondary" disabled={pending}>
          Salva
        </Button>
        <Button type="button" disabled={pending || (toPublish === 0 && !dirty)} onClick={publish}>
          {toPublish > 0 || dirty ? "Salva e pubblica" : "Pubblicato"}
        </Button>
      </div>
    </form>
  );
}
