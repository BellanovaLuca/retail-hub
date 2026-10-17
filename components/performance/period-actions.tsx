"use client";

import { Copy, Send, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  applyGoalToDepartment,
  copyFromPreviousPeriod,
  publishGoals,
} from "@/app/admin/performance/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, FormMessage, Select, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SLOTS, type Pillar } from "@/lib/performance/goals";

type Result = { ok: boolean; message?: string } | null;

/** Azioni sul periodo intero: copia dall'anno prima, stesso obiettivo a un reparto, pubblica. */
export function PeriodActions({
  year,
  departments,
  toPublish,
}: {
  year: number;
  departments: { id: string; name: string }[];
  toPublish: number;
}) {
  const router = useRouter();
  const [result, setResult] = React.useState<Result>(null);
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      router.refresh();
    });

  return (
    <div className="flex flex-col items-start gap-3 lg:items-end">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run(() => copyFromPreviousPeriod({ year }))}
        >
          <Copy aria-hidden /> Copia dal {year - 1}
        </Button>
        <DepartmentDialog
          year={year}
          departments={departments}
          onDone={(res) => {
            setResult(res);
            router.refresh();
          }}
        />
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" disabled={pending || toPublish === 0}>
              <Send aria-hidden /> Pubblica tutto{toPublish ? ` (${toPublish})` : ""}
            </Button>
          </DialogTrigger>
          <DialogContent
            title={`Pubblica il ${year}`}
            description={`${toPublish} ${toPublish === 1 ? "obiettivo definito diventa visibile" : "obiettivi definiti diventano visibili"} ai dipendenti interessati, che riceveranno una notifica. Gli spazi vuoti restano nascosti.`}
          >
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">Annulla</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => run(() => publishGoals({ year }))}>Pubblica</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <FormMessage result={result} />
    </div>
  );
}

/** "Applica gli stessi obiettivi a tutto il reparto". */
export function DepartmentDialog({
  year,
  departments,
  initial,
  onDone,
  trigger,
}: {
  year: number;
  departments: { id: string; name: string }[];
  initial?: {
    departmentId?: string;
    pillar: Pillar;
    slot: number;
    title: string;
    objective: string;
  };
  onDone: (res: { ok: boolean; message?: string }) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [departmentId, setDepartmentId] = React.useState("");
  const [slotCode, setSlotCode] = React.useState("achievement:1");
  const [title, setTitle] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [overwrite, setOverwrite] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);
  const [pending, startTransition] = React.useTransition();
  const id = React.useId();

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDepartmentId(initial?.departmentId ?? departments[0]?.id ?? "");
      setSlotCode(initial ? `${initial.pillar}:${initial.slot}` : "achievement:1");
      setTitle(initial?.title ?? "");
      setObjective(initial?.objective ?? "");
      setOverwrite(false);
      setResult(null);
    }
    setOpen(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const [pillar, slot] = slotCode.split(":");
    startTransition(async () => {
      const res = await applyGoalToDepartment({
        year,
        departmentId,
        pillar,
        slot: Number(slot),
        title,
        objective,
        overwrite,
      });
      setResult(res);
      if (res.ok) {
        onDone(res);
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="sm">
            <Users aria-hidden /> Applica a un reparto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title="Stesso obiettivo a tutto il reparto"
        description="Titolo e obiettivo vanno a tutte le persone attive del reparto principale scelto. Poi si possono personalizzare persona per persona."
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reparto" htmlFor={`${id}-dep`}>
              <Select
                id={`${id}-dep`}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Spazio" htmlFor={`${id}-slot`}>
              <Select
                id={`${id}-slot`}
                value={slotCode}
                onChange={(e) => setSlotCode(e.target.value)}
              >
                {SLOTS.map((s) => (
                  <option key={s.code} value={`${s.pillar}:${s.slot}`}>
                    {s.code} · {s.pillar === "achievement" ? "Achievement" : "Leadership"} {s.slot}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Titolo" htmlFor={`${id}-title`}>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={120}
              placeholder="es. Lenti progressive"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Obiettivo" htmlFor={`${id}-objective`}>
            <Textarea
              id={`${id}-objective`}
              value={objective}
              maxLength={2000}
              onChange={(e) => setObjective(e.target.value)}
            />
          </Field>
          <Checkbox
            label="Sovrascrivi anche chi ha già un obiettivo in questo spazio"
            description="Altrimenti chi l'ha già scritto resta com'è."
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          <FormMessage result={result} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              Applica al reparto
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pubblica (o ritira) gli obiettivi di una persona, dalla riga della tabella. */
export function PublishPersonButton({
  year,
  profileId,
  toPublish,
}: {
  year: number;
  profileId: string;
  toPublish: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  if (toPublish === 0) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await publishGoals({ year, profileId });
            setError(res.ok ? null : res.message);
            router.refresh();
          })
        }
      >
        Pubblica
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
