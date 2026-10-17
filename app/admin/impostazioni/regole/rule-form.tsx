"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { describeRule, getRuleType, RULE_TYPES } from "@/lib/rules/registry";
import type { FieldDescriptor, RuleRecord } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import { previewRule, saveRule, type RuleInput } from "./actions";
import type { VariableItem } from "./rules-manager";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

type Params = Record<string, unknown>;

/** Form di una regola: campi comuni + campi del tipo, generati dai descrittori del modulo (§7.3). */
export function RuleForm({
  ruleSetId,
  rule,
  variables,
  departments,
  onDone,
}: {
  ruleSetId: string;
  rule: RuleRecord | null;
  variables: VariableItem[];
  departments: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [type, setType] = useState(rule?.type ?? RULE_TYPES[0].type);
  const def = getRuleType(type);
  const [name, setName] = useState(rule?.name ?? "");
  const [params, setParams] = useState<Params>(
    (rule?.params as Params) ?? (def?.definition.defaultParams as Params) ?? {},
  );
  const [days, setDays] = useState<number[]>(rule?.days ?? []);
  const [windows, setWindows] = useState(rule?.timeWindows ?? []);
  const [validFrom, setValidFrom] = useState(rule?.validFrom ?? "");
  const [validTo, setValidTo] = useState(rule?.validTo ?? "");
  const [severity, setSeverity] = useState<"warning" | "info">(rule?.severity ?? "warning");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [preview, setPreview] = useState<
    { current: number; previous: number; samples: string[] } | string | null
  >(null);
  const [pending, startTransition] = useTransition();

  const input: RuleInput = useMemo(
    () => ({
      id: rule?.id,
      ruleSetId,
      name: name || def?.label || "Regola",
      type,
      params,
      days,
      timeWindows: windows,
      validFrom: validFrom || null,
      validTo: validTo || null,
      severity,
      active: rule?.active ?? true,
    }),
    [rule, ruleSetId, name, def, type, params, days, windows, validFrom, validTo, severity],
  );

  const sentence = useMemo(
    () =>
      describeRule(
        {
          ...input,
          id: "x",
          active: true,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        },
        { variables: Object.fromEntries(variables.map((v) => [v.key, v.value])), departments },
      ),
    [input, variables, departments],
  );

  // Anteprima con un piccolo ritardo mentre si modifica.
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await previewRule(input);
      setPreview(res.ok && res.data ? res.data : (res.message ?? null));
    }, 500);
    return () => clearTimeout(t);
  }, [input]);

  function changeType(next: string) {
    setType(next);
    setParams((getRuleType(next)?.definition.defaultParams as Params) ?? {});
  }

  function save() {
    startTransition(async () => {
      const res = await saveRule(input);
      setResult(res);
      if (res.ok) onDone();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="rule-name">
          <Input
            id="rule-name"
            placeholder="Es. Sabato Vista"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Tipo" htmlFor="rule-type" hint={def?.description}>
          <Select
            id="rule-type"
            value={type}
            onChange={(e) => changeType(e.target.value)}
            disabled={Boolean(rule)}
          >
            {RULE_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {def ? (
        <fieldset className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <legend className="mb-2 eyebrow">Parametri</legend>
          {def.definition.fields.map((f) => (
            <ParamField
              key={f.key}
              field={f}
              value={params[f.key]}
              onChange={(v) => setParams({ ...params, [f.key]: v })}
              variables={variables}
              departments={departments}
            />
          ))}
        </fieldset>
      ) : null}

      <fieldset className="border-t border-line pt-4">
        <legend className="mb-2 eyebrow">Giorni (nessuno = tutti)</legend>
        <div className="flex flex-wrap gap-1">
          {DAYS.map((label, i) => {
            const d = i + 1;
            const on = days.includes(d);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                className={cn(
                  "min-h-10 min-w-12 border text-sm",
                  on ? "border-foreground bg-foreground text-background" : "border-line",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="border-t border-line pt-4">
        <legend className="mb-2 eyebrow">
          Fasce orarie (nessuna = tutto l&apos;orario di apertura)
        </legend>
        <ul className="flex flex-col gap-2">
          {windows.map((w, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="Dalle"
                className="w-28 nums"
                value={w.start}
                onChange={(e) =>
                  setWindows(windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                }
              />
              <span className="text-muted">–</span>
              <Input
                type="time"
                aria-label="Alle"
                className="w-28 nums"
                value={w.end}
                onChange={(e) =>
                  setWindows(windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Elimina fascia"
                onClick={() => setWindows(windows.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setWindows([...windows, { start: "10:00", end: "13:00" }])}
        >
          <Plus aria-hidden /> Aggiungi fascia
        </Button>
      </fieldset>

      <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
        <Field label="Valida dal" htmlFor="rule-from" hint="Per regole stagionali (saldi, Natale).">
          <Input
            id="rule-from"
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </Field>
        <Field label="Al" htmlFor="rule-to">
          <Input
            id="rule-to"
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />
        </Field>
        <Field label="Gravità" htmlFor="rule-sev">
          <Select
            id="rule-sev"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "warning" | "info")}
          >
            <option value="warning">Avviso</option>
            <option value="info">Informazione (non segnalata in pubblicazione)</option>
          </Select>
        </Field>
      </div>

      <div className="rounded-md bg-surface p-4">
        <p className="text-sm">{sentence}</p>
        <p className="mt-2 text-xs text-muted" aria-live="polite">
          {preview === null
            ? "Calcolo dell'anteprima…"
            : typeof preview === "string"
              ? preview
              : `Anteprima: ${preview.current} violazion${preview.current === 1 ? "e" : "i"} nella settimana in corso, ${preview.previous} nella precedente.`}
        </p>
        {preview && typeof preview !== "string" && preview.samples.length ? (
          <ul className="mt-2 list-disc pl-4 text-xs text-muted">
            {preview.samples.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-4">
        <FormMessage result={result} />
        <Button onClick={save} disabled={pending}>
          {pending ? "Salvataggio…" : "Salva regola"}
        </Button>
      </div>
    </div>
  );
}

function ParamField({
  field,
  value,
  onChange,
  variables,
  departments,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
  variables: VariableItem[];
  departments: { id: string; name: string }[];
}) {
  const id = `p-${field.key}`;
  if (field.kind === "boolean") {
    return (
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="size-4 accent-foreground"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }
  if (field.kind === "number") {
    const isVar = typeof value === "object" && value !== null && "var" in value;
    return (
      <Field
        label={`${field.label}${field.unit ? ` (${field.unit})` : ""}`}
        htmlFor={id}
        hint={field.help}
      >
        <div className="flex gap-2">
          {field.allowVariable && variables.length ? (
            <Select
              aria-label="Numero o variabile"
              className="w-32"
              value={isVar ? "var" : "num"}
              onChange={(e) => onChange(e.target.value === "var" ? { var: variables[0].key } : 1)}
            >
              <option value="num">Numero</option>
              <option value="var">Variabile</option>
            </Select>
          ) : null}
          {isVar ? (
            <Select
              id={id}
              className="flex-1"
              value={(value as { var: string }).var}
              onChange={(e) => onChange({ var: e.target.value })}
            >
              {variables.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.key} = {v.value}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={id}
              className="w-24 nums"
              inputMode="decimal"
              value={typeof value === "number" ? String(value) : ""}
              onChange={(e) =>
                onChange(e.target.value === "" ? 0 : Number(e.target.value.replace(",", ".")))
              }
            />
          )}
        </div>
      </Field>
    );
  }
  if (field.kind === "scope") {
    const scope = (value as { kind?: string; zone?: string; departmentId?: string }) ?? {
      kind: "all",
    };
    const kinds = field.scopeKinds ?? ["zone", "department", "all"];
    return (
      <Field label={field.label} htmlFor={id}>
        <div className="flex gap-2">
          <Select
            id={id}
            className="w-36"
            value={scope.kind ?? "all"}
            onChange={(e) => {
              const k = e.target.value;
              onChange(
                k === "zone"
                  ? { kind: "zone", zone: "vista" }
                  : k === "department"
                    ? { kind: "department", departmentId: departments[0]?.id }
                    : { kind: "all" },
              );
            }}
          >
            {kinds.includes("zone") ? <option value="zone">Area</option> : null}
            {kinds.includes("department") ? <option value="department">Reparto</option> : null}
            {kinds.includes("all") ? <option value="all">Tutti</option> : null}
          </Select>
          {scope.kind === "zone" ? (
            <Select
              aria-label="Area"
              className="flex-1"
              value={scope.zone}
              onChange={(e) => onChange({ kind: "zone", zone: e.target.value })}
            >
              <option value="vista">Vista</option>
              <option value="sole">Sole</option>
            </Select>
          ) : scope.kind === "department" ? (
            <Select
              aria-label="Reparto"
              className="flex-1"
              value={scope.departmentId}
              onChange={(e) => onChange({ kind: "department", departmentId: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </Field>
    );
  }
  if (field.kind === "select") {
    return (
      <Field label={field.label} htmlFor={id} hint={field.help}>
        <Select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  if (field.kind === "time") {
    return (
      <Field label={field.label} htmlFor={id}>
        <Input
          id={id}
          type="time"
          className="w-28 nums"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }
  return null;
}
