"use client";

import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormMessage, Switch } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { describeRule, getRuleType } from "@/lib/rules/registry";
import type { RuleRecord } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import {
  deleteRule,
  deleteRuleSet,
  deleteVariable,
  duplicateRuleSet,
  moveRule,
  saveVariable,
  setDefaultRuleSet,
  setRuleActive,
} from "./actions";
import { RuleForm } from "./rule-form";

export type RuleSetItem = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
};
export type VariableItem = {
  id: string;
  key: string;
  label: string;
  value: number;
  unit: string;
  description: string;
};
type Result = { ok: boolean; message?: string } | null;

export function RulesManager({
  sets,
  currentSetId,
  rules,
  variables,
  departments,
}: {
  sets: RuleSetItem[];
  currentSetId: string | null;
  rules: RuleRecord[];
  variables: VariableItem[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RuleRecord | "new" | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();
  const current = sets.find((s) => s.id === currentSetId);
  const varMap = Object.fromEntries(variables.map((v) => [v.key, v.value]));

  function run(fn: () => Promise<{ ok: boolean; message?: string; data?: { id: string } }>) {
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok && res.data?.id) router.push(`/admin/impostazioni/regole?set=${res.data.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-sm text-muted">
        Le coperture sono regole: si creano, modificano, attivano e disattivano qui, senza toccare
        il codice. Le violazioni sono avvisi (mai blocchi) e si vedono nel foglio turni, nel
        cruscotto e alla pubblicazione. Ogni settimana usa il set predefinito oppure quello scelto
        nel foglio.
      </p>

      <section>
        <h2 className="mb-3 eyebrow">Set di regole</h2>
        <div className="flex flex-wrap items-center gap-2">
          {sets.map((s) => (
            <Link
              key={s.id}
              href={`/admin/impostazioni/regole?set=${s.id}`}
              aria-current={s.id === currentSetId ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 border px-4 text-sm",
                s.id === currentSetId
                  ? "border-foreground bg-foreground text-background"
                  : "border-line hover:border-foreground",
              )}
            >
              {s.name}
              {s.isDefault ? (
                <Star className="size-3.5 fill-current stroke-[1.5]" aria-label="Predefinito" />
              ) : null}
            </Link>
          ))}
          {current ? (
            <span className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const name = prompt(
                    `Nome del nuovo set (copia di "${current.name}")`,
                    `${current.name} (copia)`,
                  );
                  if (name) run(() => duplicateRuleSet(current.id, name));
                }}
              >
                <Copy aria-hidden /> Duplica
              </Button>
              {!current.isDefault ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setDefaultRuleSet(current.id))}
                  >
                    <Star aria-hidden /> Rendi predefinito
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      confirm(`Eliminare il set "${current.name}"?`) &&
                      run(() => deleteRuleSet(current.id))
                    }
                  >
                    <Trash2 aria-hidden /> Elimina
                  </Button>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        {current?.description ? (
          <p className="mt-3 text-sm text-muted">{current.description}</p>
        ) : null}
        <div className="mt-3">
          <FormMessage result={editing ? null : result} />
        </div>
      </section>

      {current ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="eyebrow">Regole · {current.name}</h2>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Nuova regola
            </Button>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {rules.map((rule, i) => (
              <li
                key={rule.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 py-3",
                  !rule.active && "opacity-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {rule.name}
                    <Badge>{getRuleType(rule.type)?.label ?? rule.type}</Badge>
                    {rule.severity === "info" ? <Badge>Informazione</Badge> : null}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {describeRule(rule, { variables: varMap, departments })}
                  </p>
                </div>
                <span className="flex items-center gap-1">
                  <span className="w-28">
                    <Switch
                      checked={rule.active}
                      disabled={pending}
                      onCheckedChange={(v) => run(() => setRuleActive(rule.id, v))}
                      label="Attiva"
                    />
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sposta su"
                    disabled={pending || i === 0}
                    onClick={() => run(() => moveRule(rule.id, -1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sposta giù"
                    disabled={pending || i === rules.length - 1}
                    onClick={() => run(() => moveRule(rule.id, 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Modifica ${rule.name}`}
                    onClick={() => setEditing(rule)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Elimina ${rule.name}`}
                    disabled={pending}
                    onClick={() =>
                      confirm(`Eliminare la regola "${rule.name}"?`) &&
                      run(() => deleteRule(rule.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </span>
              </li>
            ))}
            {rules.length === 0 ? (
              <li className="py-6 text-sm text-muted">Nessuna regola in questo set.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <VariablesEditor variables={variables} />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && currentSetId ? (
          <DialogContent title={editing === "new" ? "Nuova regola" : editing.name} wide>
            <RuleForm
              ruleSetId={currentSetId}
              rule={editing === "new" ? null : editing}
              variables={variables}
              departments={departments}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function VariablesEditor({ variables }: { variables: VariableItem[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(variables.map((v) => [v.id, String(v.value)])),
  );
  const [draft, setDraft] = useState({
    key: "",
    label: "",
    value: "1",
    unit: "persone",
    description: "",
  });
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      setResult(await fn());
      router.refresh();
    });
  }

  return (
    <Card>
      <CardTitle>Variabili</CardTitle>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        I parametri delle regole possono richiamare una variabile al posto di un numero fisso:
        cambiando la variabile cambiano tutte le regole che la usano.
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {variables.map((v) => (
          <li
            key={v.id}
            className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <p className="text-sm font-medium">
                {v.label} <code className="ml-1 text-xs text-muted">{v.key}</code>
              </p>
              {v.description ? <p className="text-xs text-muted">{v.description}</p> : null}
            </div>
            <span className="flex items-center gap-2">
              <Input
                aria-label={`Valore di ${v.label}`}
                className="w-20 nums"
                inputMode="decimal"
                value={values[v.id] ?? ""}
                onChange={(e) => setValues({ ...values, [v.id]: e.target.value })}
              />
              <span className="w-16 text-xs text-muted">{v.unit}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending || Number(values[v.id]?.replace(",", ".")) === v.value}
                onClick={() =>
                  run(() => saveVariable({ ...v, value: Number(values[v.id].replace(",", ".")) }))
                }
              >
                Salva
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Elimina ${v.key}`}
                disabled={pending}
                onClick={() =>
                  confirm(`Eliminare la variabile ${v.key}?`) && run(() => deleteVariable(v.id))
                }
              >
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-6 grid gap-3 sm:grid-cols-[10rem_1fr_6rem_7rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const res = await saveVariable({
              ...draft,
              value: Number(draft.value.replace(",", ".")),
            });
            if (res.ok)
              setDraft({ key: "", label: "", value: "1", unit: "persone", description: "" });
            return res;
          });
        }}
      >
        <Field label="Nome" htmlFor="var-key">
          <Input
            id="var-key"
            placeholder="min_vista_sabato"
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          />
        </Field>
        <Field label="Descrizione breve" htmlFor="var-label">
          <Input
            id="var-label"
            placeholder="Minimo Vista il sabato"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Field>
        <Field label="Valore" htmlFor="var-value">
          <Input
            id="var-value"
            className="nums"
            inputMode="decimal"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
        </Field>
        <Field label="Unità" htmlFor="var-unit">
          <Input
            id="var-unit"
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || !draft.key || !draft.label}>
          Aggiungi
        </Button>
      </form>
      <div className="mt-3">
        <FormMessage result={result} />
      </div>
    </Card>
  );
}
