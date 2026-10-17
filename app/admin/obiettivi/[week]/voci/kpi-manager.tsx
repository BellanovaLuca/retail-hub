"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormMessage, Select, Switch, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import type { KpiDefinition, KpiSet } from "@/lib/data/targets";
import { describeRule } from "@/lib/kpi/rules";
import type { DefaultTargetRule, TargetZone } from "@/lib/targets";
import {
  removeGroupItem,
  removePersonKpi,
  renameGroupItem,
  reorderGroup,
  reorderKpis,
  resetPersonKpis,
  saveKpi,
  setKpiActive,
  upsertGroupItem,
  upsertPersonKpi,
} from "../../actions";

type Person = {
  id: string;
  name: string;
  zone: TargetZone;
  kpis: { kpiId: string; label: string; labelOverride: string | null; fromGroup: boolean }[];
};

type Result = { ok: boolean; message?: string } | null;

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<Result>(null);
  const run = React.useCallback(
    (fn: () => Promise<{ ok: boolean; message?: string }>, okMessage?: string) =>
      start(async () => {
        const res = await fn();
        setResult(res.ok ? { ok: true, message: res.message ?? okMessage } : res);
        if (res.ok) router.refresh();
      }),
    [router],
  );
  return { pending, result, run, setResult };
}

const move = <T,>(list: T[], index: number, delta: number) => {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export function KpiManager({
  definitions,
  sets,
  people,
  initialPersonId,
}: {
  definitions: KpiDefinition[];
  sets: KpiSet[];
  people: Person[];
  initialPersonId: string | null;
}) {
  const { pending, result, run, setResult } = useRun();
  const [editing, setEditing] = React.useState<KpiDefinition | "new" | null>(null);
  const labelOf = React.useCallback(
    (code: string) => definitions.find((d) => d.code === code)?.label ?? code,
    [definitions],
  );
  const defById = React.useMemo(() => new Map(definitions.map((d) => [d.id, d])), [definitions]);

  return (
    <div className="flex flex-col gap-12">
      {/* ------------------------------------------------------- voci */}
      <section aria-labelledby="voci-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="voci-title" className="eyebrow">
              Voci
            </h2>
            <p className="mt-1 text-sm text-muted">
              Le voci disattivate spariscono dai fogli ma lo storico resta.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> Nuova voce
          </Button>
        </div>
        <Table>
          <thead>
            <tr>
              <Th className="w-20">Ordine</Th>
              <Th>Voce</Th>
              <Th>Codice</Th>
              <Th>Obiettivo di default</Th>
              <Th>Gruppi</Th>
              <Th>Attiva</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {definitions.map((d, i) => (
              <tr key={d.id} className={d.active ? undefined : "text-subtle"}>
                <Td>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={`Sposta su ${d.label}`}
                      disabled={pending || i === 0}
                      onClick={() =>
                        run(() => reorderKpis(move(definitions, i, -1).map((x) => x.id)))
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={`Sposta giù ${d.label}`}
                      disabled={pending || i === definitions.length - 1}
                      onClick={() =>
                        run(() => reorderKpis(move(definitions, i, 1).map((x) => x.id)))
                      }
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </Td>
                <Td>
                  <span className="font-medium">{d.label}</span>
                  {d.description ? (
                    <span className="block text-xs text-muted">{d.description}</span>
                  ) : null}
                </Td>
                <Td className="font-mono text-xs">{d.code}</Td>
                <Td className="whitespace-nowrap">{describeRule(d.rule, labelOf)}</Td>
                <Td>
                  <div className="flex gap-1">
                    {sets
                      .filter((s) => s.items.some((it) => it.kpiId === d.id))
                      .map((s) => (
                        <Badge key={s.id} tone={s.name === "Sole" ? "sole" : "vista"}>
                          {s.name}
                        </Badge>
                      ))}
                  </div>
                </Td>
                <Td>
                  <Switch
                    label=""
                    checked={d.active}
                    disabled={pending}
                    onCheckedChange={(v) => run(() => setKpiActive(d.id, v))}
                  />
                </Td>
                <Td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(d)}
                    aria-label={`Modifica ${d.label}`}
                  >
                    <Pencil aria-hidden /> Modifica
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-3">
          <FormMessage result={result} />
        </div>
      </section>

      {/* ------------------------------------------------------ gruppi */}
      <section aria-labelledby="gruppi-title">
        <h2 id="gruppi-title" className="eyebrow">
          Gruppi
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Le voci che riceve chi entra nel negozio, in base alla sua area (i jolly partono da
          Vista). L&apos;etichetta nel gruppo vale per le persone nuove (es. &quot;Pz sole x
          ADV&quot;).
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          {sets.map((s) => (
            <GroupCard key={s.id} set={s} definitions={definitions} defById={defById} />
          ))}
        </div>
      </section>

      {/* -------------------------------------------------- per persona */}
      <PersonKpis people={people} definitions={definitions} initialPersonId={initialPersonId} />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent
            title={editing === "new" ? "Nuova voce" : `Modifica · ${editing.label}`}
            description="Codice, etichetta e regola dell'obiettivo proposto nell'Assegnazione."
          >
            <KpiForm
              kpi={editing === "new" ? null : editing}
              definitions={definitions}
              onDone={(message) => {
                setEditing(null);
                // La finestra si chiude: il messaggio di esito resta nell'elenco.
                if (message) setResult({ ok: true, message });
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------ form voce */

type RuleKind = "assignment" | "pct_of" | "fixed" | "none";

function KpiForm({
  kpi,
  definitions,
  onDone,
}: {
  kpi: KpiDefinition | null;
  definitions: KpiDefinition[];
  onDone: (message?: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<{
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
  } | null>(null);
  const [code, setCode] = React.useState(kpi?.code ?? "");
  const [label, setLabel] = React.useState(kpi?.label ?? "");
  const [description, setDescription] = React.useState(kpi?.description ?? "");
  const [kind, setKind] = React.useState<RuleKind>(kpi?.rule?.type ?? "none");
  const [pct, setPct] = React.useState(
    kpi?.rule?.type === "pct_of" ? String(Math.round(kpi.rule.pct * 1000) / 10) : "20",
  );
  const [baseKpi, setBaseKpi] = React.useState(
    kpi?.rule?.type === "pct_of" ? kpi.rule.kpi : (definitions[0]?.code ?? "WO"),
  );
  const [fixed, setFixed] = React.useState(
    kpi?.rule?.type === "fixed" ? String(kpi.rule.value) : "1",
  );
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let rule: DefaultTargetRule = null;
    if (kind === "assignment") rule = { type: "assignment" };
    if (kind === "pct_of")
      rule = { type: "pct_of", kpi: baseKpi, pct: Number(pct.replace(",", ".")) / 100 };
    if (kind === "fixed") rule = { type: "fixed", value: Number(fixed.replace(",", ".")) };
    if (rule && "pct" in rule && !(rule.pct > 0)) {
      setResult({
        ok: false,
        message: "Percentuale non valida.",
        fieldErrors: { rule: "Scrivi una percentuale (es. 20)." },
      });
      return;
    }
    if (rule && "value" in rule && !(rule.value >= 0)) {
      setResult({
        ok: false,
        message: "Valore non valido.",
        fieldErrors: { rule: "Scrivi un numero." },
      });
      return;
    }
    start(async () => {
      const res = await saveKpi({
        id: kpi?.id,
        code,
        label,
        description,
        rule,
        active: kpi?.active ?? true,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        onDone(res.message);
      }
    });
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Codice" htmlFor="kpi-code" error={errors.code} hint="Es. DEMO_META">
          <Input
            id="kpi-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="font-mono"
            autoCapitalize="characters"
            required
          />
        </Field>
        <Field label="Etichetta" htmlFor="kpi-label" error={errors.label}>
          <Input id="kpi-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
      </div>
      <Field label="Descrizione" htmlFor="kpi-desc" hint="Una riga per i nuovi assunti.">
        <Textarea
          id="kpi-desc"
          rows={2}
          className="min-h-0"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Obiettivo di default" htmlFor="kpi-rule" error={errors.rule}>
        <Select id="kpi-rule" value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
          <option value="assignment">Dall&apos;assegnazione (WO / pezzi sole)</option>
          <option value="pct_of">Percentuale di un&apos;altra voce</option>
          <option value="fixed">Valore fisso</option>
          <option value="none">Nessuno (lo scrive l&apos;admin)</option>
        </Select>
      </Field>
      {kind === "pct_of" ? (
        <div className="grid grid-cols-[7rem_1fr] gap-4">
          <Field label="%" htmlFor="kpi-pct">
            <Input
              id="kpi-pct"
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
          </Field>
          <Field label="della voce" htmlFor="kpi-base">
            <Select id="kpi-base" value={baseKpi} onChange={(e) => setBaseKpi(e.target.value)}>
              {definitions
                .filter((d) => d.code !== code)
                .map((d) => (
                  <option key={d.id} value={d.code}>
                    {d.label}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      ) : null}
      {kind === "fixed" ? (
        <Field label="Valore" htmlFor="kpi-fixed">
          <Input
            id="kpi-fixed"
            inputMode="decimal"
            value={fixed}
            onChange={(e) => setFixed(e.target.value)}
          />
        </Field>
      ) : null}
      {kind === "assignment" ? (
        <p className="text-xs text-muted">
          Il calcolo dall&apos;assegnazione vale per le voci WO e PZ_SOLE; per le altre non propone
          nulla.
        </p>
      ) : null}
      <FormMessage result={result} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Annulla
        </Button>
        <Button type="submit" disabled={pending}>
          Salva
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- gruppi */

function GroupCard({
  set,
  definitions,
  defById,
}: {
  set: KpiSet;
  definitions: KpiDefinition[];
  defById: Map<string, KpiDefinition>;
}) {
  const { pending, result, run } = useRun();
  const items = [...set.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const available = definitions.filter((d) => d.active && !items.some((i) => i.kpiId === d.id));
  const [adding, setAdding] = React.useState("");
  return (
    <Card>
      <CardTitle>
        <Badge tone={set.name === "Sole" ? "sole" : "vista"}>{set.name}</Badge>
      </CardTitle>
      <ol className="flex flex-col divide-y divide-line border-y border-line">
        {items.map((item, i) => {
          const d = defById.get(item.kpiId);
          if (!d) return null;
          return (
            <li key={item.kpiId} className="flex min-h-12 items-center gap-2 py-1">
              <span className="w-6 text-xs text-muted nums">{i + 1}</span>
              <Input
                aria-label={`Etichetta di ${d.label} nel gruppo ${set.name}`}
                defaultValue={item.labelOverride ?? ""}
                placeholder={d.label}
                className="h-9 flex-1"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (item.labelOverride ?? ""))
                    run(
                      () =>
                        renameGroupItem({
                          setId: set.id,
                          kpiId: item.kpiId,
                          labelOverride: v || null,
                        }),
                      "Etichetta salvata.",
                    );
                }}
              />
              {!d.active ? <Badge>Disattiva</Badge> : null}
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Sposta su ${d.label}`}
                disabled={pending || i === 0}
                onClick={() =>
                  run(() =>
                    reorderGroup(
                      set.id,
                      move(items, i, -1).map((x) => x.kpiId),
                    ),
                  )
                }
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Sposta giù ${d.label}`}
                disabled={pending || i === items.length - 1}
                onClick={() =>
                  run(() =>
                    reorderGroup(
                      set.id,
                      move(items, i, 1).map((x) => x.kpiId),
                    ),
                  )
                }
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Togli ${d.label} dal gruppo ${set.name}`}
                disabled={pending}
                onClick={() => run(() => removeGroupItem(set.id, item.kpiId))}
              >
                <X />
              </Button>
            </li>
          );
        })}
      </ol>
      {available.length ? (
        <div className="mt-4 flex gap-2">
          <Select
            aria-label={`Voce da aggiungere al gruppo ${set.name}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="flex-1"
          >
            <option value="">Aggiungi una voce…</option>
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!adding || pending}
            onClick={() => {
              run(() => upsertGroupItem({ setId: set.id, kpiId: adding }));
              setAdding("");
            }}
          >
            Aggiungi
          </Button>
        </div>
      ) : null}
      <div className="mt-3">
        <FormMessage result={result} />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- persona */

function PersonKpis({
  people,
  definitions,
  initialPersonId,
}: {
  people: Person[];
  definitions: KpiDefinition[];
  initialPersonId: string | null;
}) {
  const { pending, result, run } = useRun();
  const [personId, setPersonId] = React.useState(initialPersonId ?? people[0]?.id ?? "");
  const [adding, setAdding] = React.useState("");
  const person = people.find((p) => p.id === personId);
  if (!person) return null;
  const fromGroup = person.kpis.length > 0 && person.kpis.every((k) => k.fromGroup);
  const groupName = person.zone === "sole" ? "Sole" : "Vista";
  const available = definitions.filter(
    (d) => d.active && !person.kpis.some((k) => k.kpiId === d.id),
  );
  const defLabel = (id: string) => definitions.find((d) => d.id === id)?.label ?? "";

  return (
    <section aria-labelledby="persona-title">
      <h2 id="persona-title" className="eyebrow">
        Voci per persona
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Ogni persona parte dal gruppo della sua area; qui si aggiungono, tolgono o rinominano le sue
        voci (es. &quot;Pz sole x ADV&quot;).
      </p>
      <Card>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <Field label="Persona" htmlFor="kpi-person" className="min-w-56">
            <Select
              id="kpi-person"
              value={personId}
              onChange={(e) => {
                setPersonId(e.target.value);
                setAdding("");
              }}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Badge tone={person.zone === "sole" ? "sole" : "vista"}>
            {person.zone === "jolly" ? "Jolly" : groupName}
          </Badge>
          {fromGroup ? <Badge>Voci del gruppo {groupName}</Badge> : null}
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  `Reimpostare le voci di ${person.name} da quelle del gruppo ${groupName}? Le etichette personali si perdono.`,
                )
              )
                run(() => resetPersonKpis(person.id));
            }}
          >
            <RotateCcw aria-hidden /> Reimposta dal gruppo della sua area
          </Button>
        </div>
        {person.kpis.length === 0 ? (
          <p className="text-sm text-subtle">Nessuna voce.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line border-y border-line">
            {person.kpis.map((k) => (
              <li key={`${person.id}-${k.kpiId}`} className="flex min-h-12 items-center gap-3 py-1">
                <span className="w-40 shrink-0 truncate text-sm text-muted">
                  {defLabel(k.kpiId)}
                </span>
                <Input
                  aria-label={`Etichetta personale di ${defLabel(k.kpiId)}`}
                  defaultValue={k.labelOverride ?? ""}
                  placeholder={defLabel(k.kpiId)}
                  className="h-9 flex-1"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (k.labelOverride ?? ""))
                      run(
                        () =>
                          upsertPersonKpi({
                            profileId: person.id,
                            kpiId: k.kpiId,
                            labelOverride: v || null,
                          }),
                        "Etichetta salvata.",
                      );
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`Togli ${k.label} a ${person.name}`}
                  disabled={pending}
                  onClick={() => run(() => removePersonKpi(person.id, k.kpiId))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        )}
        {available.length ? (
          <div className="mt-4 flex gap-2">
            <Select
              aria-label={`Voce da aggiungere a ${person.name}`}
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className="flex-1"
            >
              <option value="">Aggiungi una voce…</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              disabled={!adding || pending}
              onClick={() => {
                run(() => upsertPersonKpi({ profileId: person.id, kpiId: adding }));
                setAdding("");
              }}
            >
              Aggiungi
            </Button>
          </div>
        ) : null}
        <div className="mt-3">
          <FormMessage result={result} />
        </div>
      </Card>
    </section>
  );
}
