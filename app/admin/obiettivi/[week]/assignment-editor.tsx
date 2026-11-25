"use client";

import { formatInRome } from "@/lib/dates";
import { Calculator, Copy, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  SpreadsheetGrid,
  type CellChange,
  type CellState,
  type FooterRow,
  type GridColumn,
  type GridGroup,
  type GridRow,
} from "@/components/spreadsheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormMessage, Textarea } from "@/components/ui/form";
import { Input, Label } from "@/components/ui/input";
import {
  buildAssignmentPreview,
  cellKey,
  formatAmount,
  formatEurPerHour,
  overridesFromSaved,
  parseAmount,
} from "@/lib/kpi/assignment";
import { formatCount, parseCount } from "@/lib/kpi/sheet";
import {
  assignmentKpisFor,
  extraKpisFromSaved,
  isCalculationOn,
  withExtraKpis,
} from "@/lib/kpi/simple-assignment";
import type { DefaultTargetRule, StoreWeeklyTargets, TargetZone } from "@/lib/targets";
import { cn } from "@/lib/utils";
import { confirmAssignment, getPreviousAssignment } from "../actions";

type Person = {
  profileId: string;
  name: string;
  color: string | null;
  zone: TargetZone;
  plannedHours: number;
  hasShifts: boolean;
  kpis: { kpiId: string; code: string; label: string }[];
};

type Kpi = { kpiId: string; code: string; label: string; defaultTargetRule: DefaultTargetRule };

type StoreField = keyof StoreWeeklyTargets;

const FIELDS: {
  key: StoreField;
  label: string;
  suffix?: string;
  group: "vista" | "sole" | "ore";
}[] = [
  { key: "totalHours", label: "Ore totali", suffix: "h", group: "ore" },
  { key: "vistaValueEur", label: "Generato vista", suffix: "€", group: "vista" },
  { key: "vistaAvgPrice", label: "PM vista", suffix: "€", group: "vista" },
  { key: "vistaWo", label: "WO", group: "vista" },
  { key: "solePieces", label: "Pezzi sole", group: "sole" },
  { key: "soleValueEur", label: "Valore sole", suffix: "€", group: "sole" },
  { key: "soleAvgPrice", label: "PM sole", suffix: "€", group: "sole" },
];

const HOURS = "__ore";
const COMMENT = "__commento";

export function AssignmentEditor(props: {
  weekStart: string;
  weekNumber: number;
  plannedTotal: number;
  scheduleStatus: "draft" | "published" | null;
  store: (StoreWeeklyTargets & { confirmedAt: string | null }) | null;
  people: Person[];
  kpis: Kpi[];
  savedTargets: { profileId: string; kpiId: string; target: number; overridden: boolean }[];
  /** Commento generale della settimana per persona (lo vede in cima alla pagina Obiettivi). */
  comments: { profileId: string; body: string; published: boolean }[];
  /** Persone senza ore in vendita (e senza obiettivi salvati): nessuna proposta automatica. */
  withoutHours: string[];
}) {
  const { weekStart, kpis } = props;
  const router = useRouter();
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);

  const initialStore: StoreWeeklyTargets = props.store ?? {
    totalHours: props.plannedTotal,
    vistaValueEur: 0,
    vistaAvgPrice: 0,
    vistaWo: 0,
    solePieces: 0,
    soleValueEur: 0,
    soleAvgPrice: 0,
  };
  const [text, setText] = React.useState<Record<StoreField, string>>(
    () =>
      Object.fromEntries(
        FIELDS.map((f) => [f.key, initialStore[f.key] ? formatAmount(initialStore[f.key]) : ""]),
      ) as Record<StoreField, string>,
  );
  const store = React.useMemo(
    () =>
      Object.fromEntries(FIELDS.map((f) => [f.key, parseAmount(text[f.key]) ?? 0])) as Record<
        StoreField,
        number
      >,
    [text],
  );
  const invalid = FIELDS.filter((f) => parseAmount(text[f.key]) === null).map((f) => f.key);

  // Calcolo dalla produttività oraria: solo se sono stati inseriti i valori del negozio.
  // Altrimenti gli obiettivi si scrivono a mano (restano le regole fisse e le "% di …").
  const calcOn = isCalculationOn(store);
  const [calcInitiallyOpen] = React.useState(() => isCalculationOn(initialStore));
  const calcKpis = React.useMemo(() => assignmentKpisFor(kpis, calcOn), [kpis, calcOn]);

  // Voci scritte fuori dal foglio della persona: alla conferma si aggiungono al suo foglio.
  const [extra, setExtra] = React.useState<Record<string, string[]>>(() =>
    extraKpisFromSaved(props.people, props.savedTargets),
  );
  const people = React.useMemo(
    () => withExtraKpis(props.people, extra, kpis),
    [props.people, extra, kpis],
  );

  const initialComments = React.useMemo(
    () => Object.fromEntries(props.comments.map((c) => [c.profileId, c.body])),
    [props.comments],
  );
  const [comments, setComments] = React.useState<Record<string, string>>(initialComments);
  const [editingComment, setEditingComment] = React.useState<string | null>(null);
  const unpublishedComments = props.comments.filter((c) => c.body && !c.published).length;

  const [overrides, setOverrides] = React.useState<Record<string, number | null>>(() => {
    const base = buildAssignmentPreview({
      store: initialStore,
      people,
      kpis: assignmentKpisFor(kpis, isCalculationOn(initialStore)),
      overrides: {},
    });
    return overridesFromSaved(props.savedTargets, base.cells);
  });

  const preview = React.useMemo(
    () => buildAssignmentPreview({ store, people, kpis: calcKpis, overrides }),
    [store, people, calcKpis, overrides],
  );

  /* ---------------------------------------------------------- griglia */

  // Tutte le voci attive: una cella fuori dal foglio della persona resta scrivibile.
  const usedKpis = kpis;
  const personKpi = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) for (const k of p.kpis) m.set(cellKey(p.profileId, k.kpiId), k.label);
    return m;
  }, [people]);

  const groups: GridGroup[] = [
    { id: "vista", label: "Vista · Jolly" },
    { id: "sole", label: "Sole" },
  ];
  const rows: GridRow[] = React.useMemo(
    () =>
      [...people]
        .sort(
          (a, b) =>
            Number(a.zone === "sole") - Number(b.zone === "sole") ||
            Number(a.plannedHours === 0) - Number(b.plannedHours === 0),
        )
        .map((p) => ({
          id: p.profileId,
          label: p.name,
          sublabel:
            p.plannedHours === 0
              ? p.hasShifts
                ? "Solo back office"
                : "Nessun turno"
              : p.zone === "jolly"
                ? "Jolly"
                : undefined,
          groupId: p.zone === "sole" ? "sole" : "vista",
          accentColor: p.color ?? undefined,
        })),
    [people],
  );
  const columns: GridColumn[] = React.useMemo(
    () => [
      // Il commento subito accanto al nome: così si vede e non resta in fondo.
      { id: COMMENT, label: "Commento", sublabel: "lo vede in cima", width: 240 },
      { id: HOURS, label: "Ore", sublabel: "pianificate", width: 76 },
      ...usedKpis.map((k) => ({
        id: k.kpiId,
        label: k.label,
        width: Math.max(76, Math.min(120, k.label.length * 8 + 20)),
        className: k.code === "WO" || k.code === "PZ_SOLE" ? "font-semibold" : undefined,
      })),
    ],
    [usedKpis],
  );
  const hoursById = React.useMemo(
    () => new Map(people.map((p) => [p.profileId, p.plannedHours])),
    [people],
  );

  const getValue = React.useCallback(
    (profileId: string, col: string) => {
      if (col === HOURS) return formatCount(hoursById.get(profileId) ?? 0);
      if (col === COMMENT) return comments[profileId] ?? "";
      const cell = preview.cells.get(cellKey(profileId, col));
      return cell?.value === null || !cell ? "" : formatCount(cell.value);
    },
    [preview, hoursById, comments],
  );
  const getCellState = React.useCallback(
    (profileId: string, col: string): CellState | undefined => {
      if (col === HOURS) return { readOnly: true, tone: "muted" };
      if (col === COMMENT) {
        const body = comments[profileId] ?? "";
        return {
          className: "justify-start text-left whitespace-nowrap",
          tone: body !== (initialComments[profileId] ?? "") ? "warning" : undefined,
          title: body
            ? `${body}\n\nDoppio clic per il testo lungo.`
            : "Scrivi un commento per la persona (doppio clic per il testo lungo).",
        };
      }
      const key = cellKey(profileId, col);
      if (!personKpi.has(key))
        return {
          tone: "muted",
          title: "Voce non presente nel foglio della persona: scrivi un obiettivo per aggiungerla.",
        };
      const cell = preview.cells.get(key);
      if (cell?.overridden && cell.computed !== null)
        return {
          className: "font-semibold underline decoration-1 underline-offset-4 bg-foreground/[0.06]",
          title: `Corretto a mano · proposta: ${cell.computed === null ? "nessuna" : formatCount(cell.computed)}. Svuota la cella per tornare alla proposta.`,
        };
      return { title: personKpi.get(key) };
    },
    [preview, personKpi, comments, initialComments],
  );
  const onChange = React.useCallback(
    (changes: CellChange[]) => {
      const numbers = changes.filter((c) => c.colId !== HOURS && c.colId !== COMMENT);
      const texts = changes.filter((c) => c.colId === COMMENT);
      if (texts.length)
        setComments((prev) => {
          const next = { ...prev };
          for (const c of texts) next[c.rowId] = c.value.slice(0, 4000);
          return next;
        });
      const bad = numbers.some((c) => parseCount(c.value) === "invalid");
      if (bad) setResult({ ok: false, message: "Negli obiettivi scrivi un numero (es. 12)." });
      // Una voce fuori dal foglio diventa parte del foglio della persona.
      const added = numbers.filter(
        (c) => !personKpi.has(cellKey(c.rowId, c.colId)) && typeof parseCount(c.value) === "number",
      );
      if (added.length)
        setExtra((prev) => {
          const next = { ...prev };
          for (const c of added) next[c.rowId] = [...new Set([...(next[c.rowId] ?? []), c.colId])];
          return next;
        });
      setOverrides((prev) => {
        const next = { ...prev };
        for (const c of numbers) {
          const key = cellKey(c.rowId, c.colId);
          const v = parseCount(c.value);
          if (v === "invalid") continue;
          if (v === null) delete next[key];
          else next[key] = v;
        }
        return next;
      });
      setDirty(true);
    },
    [personKpi],
  );

  const footerRows: FooterRow[] = React.useMemo(() => {
    const assigned: Record<string, React.ReactNode> = {
      [HOURS]: formatCount(people.reduce((s, p) => s + p.plannedHours, 0)),
    };
    const target: Record<string, React.ReactNode> = { [HOURS]: formatCount(store.totalHours) };
    for (const k of usedKpis) {
      assigned[k.kpiId] = formatCount(preview.assignedByKpi[k.kpiId] ?? 0);
      if (k.code === "WO") target[k.kpiId] = formatCount(store.vistaWo);
      if (k.code === "PZ_SOLE") target[k.kpiId] = formatCount(store.solePieces);
    }
    return [
      { id: "assegnati", label: "Assegnati", cells: assigned },
      ...(calcOn ? [{ id: "negozio", label: "Obiettivo negozio", cells: target }] : []),
    ];
  }, [people, usedKpis, preview, store, calcOn]);

  /* ---------------------------------------------------------- azioni */

  const onConfirm = () => {
    if (invalid.length) {
      setResult({ ok: false, message: "Controlla i numeri del negozio." });
      return;
    }
    const cells = people.flatMap((p) =>
      p.kpis
        .map((k) => ({ k, cell: preview.cells.get(cellKey(p.profileId, k.kpiId)) }))
        .filter(({ cell }) => cell && cell.value !== null)
        .map(({ k, cell }) => ({
          profileId: p.profileId,
          kpiId: k.kpiId,
          target: cell!.value!,
          overridden: cell!.overridden,
        })),
    );
    startTransition(async () => {
      const res = await confirmAssignment({
        weekStart,
        store: {
          ...store,
          vistaWo: Math.round(store.vistaWo),
          solePieces: Math.round(store.solePieces),
        },
        cells,
        profileIds: people.map((p) => p.profileId),
        comments: people
          .filter(
            (p) =>
              (comments[p.profileId] ?? "") !== (initialComments[p.profileId] ?? "") ||
              props.comments.some((c) => c.profileId === p.profileId && c.body && !c.published),
          )
          .map((p) => ({ profileId: p.profileId, body: comments[p.profileId] ?? "" })),
        notify: true,
      });
      setResult(res);
      if (res.ok) {
        setDirty(false);
        router.refresh();
      }
    });
  };

  const onCopy = () => {
    startTransition(async () => {
      const res = await getPreviousAssignment(weekStart);
      if (!res.ok || !res.data) {
        setResult(res.ok ? { ok: false, message: "Niente da copiare." } : res);
        return;
      }
      const prev = res.data;
      if (prev.store) {
        const s = prev.store;
        setText((t) => ({
          ...t,
          ...Object.fromEntries(
            FIELDS.filter((f) => f.key !== "totalHours").map((f) => [
              f.key,
              s[f.key] ? formatAmount(s[f.key]) : "",
            ]),
          ),
        }));
      }
      // Si copiano i valori così com'erano, per le persone ancora in elenco.
      const here = new Set(props.people.map((p) => p.profileId));
      const targets = prev.targets.filter((t) => here.has(t.profileId));
      setExtra((e) => {
        const next = { ...e };
        for (const [id, list] of Object.entries(extraKpisFromSaved(props.people, targets)))
          next[id] = [...new Set([...(next[id] ?? []), ...list])];
        return next;
      });
      setOverrides(
        Object.fromEntries(targets.map((t) => [cellKey(t.profileId, t.kpiId), t.target])),
      );
      setDirty(true);
      const n = new Set(targets.map((t) => t.profileId)).size;
      setResult({
        ok: true,
        message: `Copiati gli obiettivi della settimana prima${n ? ` (${n} ${n === 1 ? "persona" : "persone"})` : ""}: controlla e conferma.`,
      });
    });
  };

  const sole = people.filter((p) => p.zone === "sole");
  const adv = people
    .filter((p) => p.zone !== "sole")
    .reduce((s, p) => {
      const k = p.kpis.find((x) => x.code === "PZ_SOLE");
      return s + (k ? (preview.cells.get(cellKey(p.profileId, k.kpiId))?.value ?? 0) : 0);
    }, 0);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-light tracking-tight">
              Obiettivi della settimana
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Una riga per persona: scrivi direttamente nelle celle cosa deve fare in settimana e,
              nella colonna «Commento» un messaggio per la persona (lo vedrà in evidenza in cima
              alla sua pagina Obiettivi). Poi «Conferma e avvisa».
              {calcOn
                ? " Le celle vuote prendono la proposta del calcolo automatico; quelle corrette a mano restano sottolineate."
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unpublishedComments && !dirty ? (
              <Badge tone="warning">
                {unpublishedComments === 1
                  ? "1 commento da pubblicare"
                  : `${unpublishedComments} commenti da pubblicare`}
              </Badge>
            ) : null}
            {props.store?.confirmedAt && !dirty ? (
              <Badge tone="success">
                Confermati il {formatInRome(props.store.confirmedAt, "d MMM 'alle' HH:mm")}
              </Badge>
            ) : dirty ? (
              <Badge tone="warning">Modifiche da confermare</Badge>
            ) : (
              <Badge>Non ancora confermati</Badge>
            )}
            <Button variant="secondary" size="sm" onClick={onCopy} disabled={pending}>
              <Copy aria-hidden /> Copia dalla settimana precedente
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={pending || people.length === 0}>
              <Send aria-hidden /> Conferma e avvisa
            </Button>
          </div>
        </div>

        {people.length === 0 ? (
          <p className="py-10 font-display text-2xl font-light text-subtle">
            Nessuna persona attiva: aggiungile da Amministrazione → Dipendenti.
          </p>
        ) : (
          <SpreadsheetGrid
            ariaLabel={`Obiettivi della week ${props.weekNumber}`}
            rows={rows}
            columns={columns}
            groups={groups}
            getValue={getValue}
            getCellState={getCellState}
            onChange={onChange}
            onCellActivate={(rowId, colId) => {
              if (colId === COMMENT) setEditingComment(rowId);
            }}
            footerRows={footerRows}
            rowHeaderLabel="Persona"
            showDensityToggle
          />
        )}

        <dl className="grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
          <Summary
            label="WO assegnati"
            value={preview.woAssigned}
            target={store.vistaWo}
            hidden={!calcOn && !store.vistaWo}
          />
          <Summary
            label="Pezzi sole assegnati (Sole)"
            value={preview.solePiecesAssigned}
            target={store.solePieces}
            extra={adv ? `+ ${formatCount(adv)} pz sole x ADV` : undefined}
            hidden={(sole.length === 0 || !calcOn) && !store.solePieces}
          />
          <Summary
            label="Ore pianificate"
            value={people.reduce((s, p) => s + p.plannedHours, 0)}
            target={store.totalHours}
            unit="h"
          />
        </dl>
        {props.withoutHours.length ? (
          <p className="text-xs text-muted">
            Senza ore in vendita nei turni di questa settimana: {props.withoutHours.join(", ")}. Gli
            obiettivi si calcolano sulle ore dei turni, quindi per loro non c&apos;è una proposta:
            scrivili a mano nelle celle oppure inserisci prima i turni in Turni.
          </p>
        ) : null}
        {props.scheduleStatus !== "published" ? (
          <p className="text-xs text-warning">
            I turni di questa settimana non sono ancora pubblicati: le ore potrebbero cambiare.
          </p>
        ) : null}
        <FormMessage result={result} />
      </section>
      <details
        className="group rounded-lg border border-line"
        open={calcInitiallyOpen || undefined}
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <Calculator className="size-5 stroke-[1.5]" aria-hidden />
          <span className="flex-1">
            <span className="block font-medium">
              Calcolo automatico con la produttività oraria (facoltativo)
            </span>
            <span className="block text-sm text-muted">
              {calcOn
                ? `Attivo: ${formatEurPerHour(preview.assignment.eurPerHourVista)} vista · ${formatEurPerHour(preview.assignment.eurPerHourSole)} sole. Propone WO e pezzi sole in base alle ore.`
                : "Inserisci generato vista e valore sole del negozio per farti proporre WO e pezzi sole in base alle ore di ciascuno."}
            </span>
          </span>
          <span className="text-sm text-muted group-open:hidden">Apri</span>
          <span className="hidden text-sm text-muted group-open:inline">Chiudi</span>
        </summary>
        <div className="border-t border-line p-5">
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Card>
              <CardTitle>Obiettivi del negozio</CardTitle>
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
                {(["ore", "vista", "sole"] as const).map((group) => (
                  <fieldset key={group} className="flex flex-col gap-4">
                    <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
                      {group === "ore" ? (
                        "Ore"
                      ) : (
                        <Badge tone={group}>{group === "vista" ? "Vista" : "Sole"}</Badge>
                      )}
                    </legend>
                    {FIELDS.filter((f) => f.group === group).map((f) => (
                      <div key={f.key} className="flex flex-col gap-1.5">
                        <Label htmlFor={`f-${f.key}`}>
                          {f.label}
                          {f.suffix ? ` (${f.suffix})` : ""}
                        </Label>
                        <Input
                          id={`f-${f.key}`}
                          inputMode="decimal"
                          autoComplete="off"
                          className="nums"
                          value={text[f.key]}
                          aria-invalid={invalid.includes(f.key) || undefined}
                          onChange={(e) => {
                            setText((t) => ({ ...t, [f.key]: e.target.value }));
                            setDirty(true);
                          }}
                        />
                        {f.key === "totalHours" ? (
                          <p className="text-xs text-muted">
                            Dai turni: {formatCount(props.plannedTotal)} h
                            {store.totalHours !== props.plannedTotal ? (
                              <>
                                {" · "}
                                <button
                                  type="button"
                                  className="underline underline-offset-2"
                                  onClick={() => {
                                    setText((t) => ({
                                      ...t,
                                      totalHours: formatAmount(props.plannedTotal),
                                    }));
                                    setDirty(true);
                                  }}
                                >
                                  usa questo
                                </button>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </fieldset>
                ))}
              </div>
            </Card>

            <Card className="flex flex-col gap-5">
              <CardTitle className="mb-0">Valore per ora</CardTitle>
              <div>
                <p className="eyebrow">€/ora vista</p>
                <p className="mt-1 font-display text-3xl font-light nums">
                  {formatEurPerHour(preview.assignment.eurPerHourVista)}
                </p>
              </div>
              <div>
                <p className="eyebrow">€/ora sole</p>
                <p className="mt-1 font-display text-3xl font-light nums">
                  {formatEurPerHour(preview.assignment.eurPerHourSole)}
                </p>
              </div>
              <p className="text-xs text-muted">
                Generato ÷ ore totali. Per ogni persona: €/ora × ore pianificate ÷ PM, arrotondato.
              </p>
            </Card>
          </section>
        </div>
      </details>

      <Dialog open={editingComment !== null} onOpenChange={(o) => !o && setEditingComment(null)}>
        {editingComment ? (
          <DialogContent
            title="Commento della settimana"
            description={people.find((p) => p.profileId === editingComment)?.name}
          >
            <CommentForm
              initial={comments[editingComment] ?? ""}
              onSubmit={(body) => {
                setComments((c) => ({ ...c, [editingComment]: body }));
                setDirty(true);
                setEditingComment(null);
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function CommentForm({ initial, onSubmit }: { initial: string; onSubmit: (body: string) => void }) {
  const [body, setBody] = React.useState(initial);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(body.trim());
      }}
    >
      <Textarea
        aria-label="Testo del commento"
        rows={6}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Es. Ottima settimana sui doppi, ora spingiamo le demo META."
        autoFocus
      />
      <p className="text-xs text-muted">
        Viene pubblicato con «Conferma e avvisa»: la persona lo vede in cima alla sua pagina
        Obiettivi.
      </p>
      <div className="flex justify-end">
        <Button type="submit">Fatto</Button>
      </div>
    </form>
  );
}

function Summary({
  label,
  value,
  target,
  unit,
  extra,
  hidden,
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  extra?: string;
  hidden?: boolean;
}) {
  if (hidden) return <div />;
  const diff = value - target;
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 nums">
        <span className="font-display text-2xl font-light">{formatCount(value)}</span>
        <span className="text-muted">
          {" "}
          / {formatCount(target)}
          {unit ? ` ${unit}` : ""}
        </span>
        {target > 0 && diff !== 0 ? (
          <span className={cn("ml-2 text-xs", diff < 0 ? "text-warning" : "text-muted")}>
            {diff > 0 ? "+" : ""}
            {formatCount(Math.round(diff * 100) / 100)}
          </span>
        ) : null}
        {extra ? <span className="mt-0.5 block text-xs text-muted">{extra}</span> : null}
      </dd>
    </div>
  );
}
