"use client";

import { Calculator, Columns3, Copy, Eraser, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { AddColumn } from "@/components/ui/add-column";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Checkbox, FormMessage, Textarea } from "@/components/ui/form";
import { Input, Label } from "@/components/ui/input";
import { formatInRome } from "@/lib/dates";
import {
  AREA_LABEL,
  areaColumns,
  areaOf,
  fillProposals,
  type Area,
  type AreaSet,
} from "@/lib/kpi/area-tables";
import { cellKey, formatAmount, formatEurPerHour, parseAmount } from "@/lib/kpi/assignment";
import { formatCount, parseCount } from "@/lib/kpi/sheet";
import {
  PRODUCTIVITY_TARGET,
  productivityLevel,
  totalProductivity,
  totalRevenue,
  type DefaultTargetRule,
  type StoreWeeklyTargets,
  type TargetZone,
} from "@/lib/targets";
import { cn } from "@/lib/utils";
import { confirmAssignment, getPreviousAssignment, quickAddKpi, removeGroupItem } from "../actions";
import { TargetsTable, type TargetsColumn, type TargetsRow } from "./targets-table";

type Person = {
  profileId: string;
  name: string;
  color: string | null;
  zone: TargetZone;
  plannedHours: number;
  hasShifts: boolean;
};

type Kpi = { kpiId: string; code: string; label: string; defaultTargetRule: DefaultTargetRule };

type StoreField = keyof Required<StoreWeeklyTargets>;
type FieldGroup = "ore" | "vista" | "sole" | "lac" | "altro";

const FIELDS: { key: StoreField; label: string; suffix?: string; group: FieldGroup }[] = [
  { key: "totalHours", label: "Ore lavorate", suffix: "h", group: "ore" },
  { key: "vistaValueEur", label: "Fatturato", suffix: "€", group: "vista" },
  { key: "vistaAvgPrice", label: "Prezzo medio", suffix: "€", group: "vista" },
  { key: "vistaWo", label: "Numero WO", group: "vista" },
  { key: "soleValueEur", label: "Fatturato", suffix: "€", group: "sole" },
  { key: "soleAvgPrice", label: "Prezzo medio", suffix: "€", group: "sole" },
  { key: "solePieces", label: "Numero pezzi", group: "sole" },
  { key: "lacValueEur", label: "Fatturato", suffix: "€", group: "lac" },
  { key: "lacAvgPrice", label: "Prezzo medio", suffix: "€", group: "lac" },
  { key: "lacPieces", label: "Numero", group: "lac" },
  { key: "otherValueEur", label: "Fatturato", suffix: "€", group: "altro" },
];
const GROUP_TITLE: Record<FieldGroup, string> = {
  ore: "Ore",
  vista: "Vista",
  sole: "Sole",
  lac: "Lenti a contatto",
  altro: "Mondo altro",
};
const AREAS: Area[] = ["vista", "sole"];

export function AssignmentEditor(props: {
  weekStart: string;
  weekNumber: number;
  plannedTotal: number;
  scheduleStatus: "draft" | "published" | null;
  store: (StoreWeeklyTargets & { confirmedAt: string | null }) | null;
  people: Person[];
  /** Voci attive. */
  kpis: Kpi[];
  /** Gruppi di voci «Vista» e «Sole»: le colonne di ciascuna tabella. */
  sets: AreaSet[];
  savedTargets: { profileId: string; kpiId: string; target: number }[];
  /** Commento generale della settimana per persona (lo vede in cima alla pagina Obiettivi). */
  comments: { profileId: string; body: string; published: boolean }[];
}) {
  const { weekStart, kpis, sets, people } = props;
  const router = useRouter();
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);

  /* ------------------------------------------------- numeri del negozio */

  const initialStore: Required<StoreWeeklyTargets> = {
    totalHours: props.store?.totalHours ?? props.plannedTotal,
    vistaValueEur: props.store?.vistaValueEur ?? 0,
    vistaAvgPrice: props.store?.vistaAvgPrice ?? 0,
    vistaWo: props.store?.vistaWo ?? 0,
    solePieces: props.store?.solePieces ?? 0,
    soleValueEur: props.store?.soleValueEur ?? 0,
    soleAvgPrice: props.store?.soleAvgPrice ?? 0,
    lacAvgPrice: props.store?.lacAvgPrice ?? 0,
    lacPieces: props.store?.lacPieces ?? 0,
    lacValueEur: props.store?.lacValueEur ?? 0,
    otherValueEur: props.store?.otherValueEur ?? 0,
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
  const [calcInitiallyOpen] = React.useState(() => totalRevenue(initialStore) > 0);
  const productivity = totalProductivity(store);
  const level = productivityLevel(productivity);
  const perHour = (value: number) => (store.totalHours > 0 ? value / store.totalHours : 0);

  /* ------------------------------------------------- obiettivi (solo valori scritti) */

  const activeKpiIds = React.useMemo(() => new Set(kpis.map((k) => k.kpiId)), [kpis]);
  const [values, setValues] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(
      props.savedTargets
        .filter((t) => people.some((p) => p.profileId === t.profileId))
        .map((t) => [cellKey(t.profileId, t.kpiId), t.target]),
    ),
  );

  const initialComments = React.useMemo(
    () => Object.fromEntries(props.comments.map((c) => [c.profileId, c.body])),
    [props.comments],
  );
  const [comments, setComments] = React.useState<Record<string, string>>(initialComments);
  const [editingComment, setEditingComment] = React.useState<string | null>(null);
  const unpublishedComments = props.comments.filter((c) => c.body && !c.published).length;
  const changedComments = React.useMemo(
    () =>
      new Set(
        people
          .filter((p) => (comments[p.profileId] ?? "") !== (initialComments[p.profileId] ?? ""))
          .map((p) => p.profileId),
      ),
    [people, comments, initialComments],
  );

  const [showMixed, setShowMixed] = React.useState<Record<Area, boolean>>({
    vista: false,
    sole: false,
  });
  // Finestra «Gestisci colonne» di una tabella e, al suo interno, la colonna da confermare.
  const [managing, setManaging] = React.useState<Area | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const [manageResult, setManageResult] = React.useState<{
    ok: boolean;
    message?: string;
  } | null>(null);
  const [justAdded, setJustAdded] = React.useState<{ area: Area; kpiId: string } | null>(null);
  React.useEffect(() => {
    if (!justAdded) return;
    document
      .getElementById(`tab-${justAdded.area}-col-${justAdded.kpiId}`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [justAdded, kpis, sets]);

  const tables = React.useMemo(
    () =>
      AREAS.map((area) => {
        const members = people
          .filter((p) => areaOf(p.zone) === area)
          .sort((a, b) => Number(a.plannedHours === 0) - Number(b.plannedHours === 0));
        const usedKpiIds = new Set(
          Object.keys(values)
            .filter((key) => members.some((p) => key.startsWith(`${p.profileId}|`)))
            .map((key) => key.split("|")[1]),
        );
        const columns: TargetsColumn[] = areaColumns({
          area,
          sets,
          kpis,
          showMixed: showMixed[area],
          usedKpiIds,
        }).map((c) => ({
          kpiId: c.kpiId,
          label: c.label,
          mixed: c.mixed,
          strong: !c.mixed && (c.code === "WO" || c.code === "PZ_SOLE"),
        }));
        const rows: TargetsRow[] = members.map((p) => ({
          profileId: p.profileId,
          name: p.name,
          color: p.color,
          sublabel:
            p.plannedHours === 0
              ? p.hasShifts
                ? "Solo back office"
                : "Nessun turno"
              : p.zone === "jolly"
                ? "Jolly"
                : undefined,
          hours: formatCount(p.plannedHours),
        }));
        const byKpi: Record<string, string> = {};
        for (const c of columns) {
          const list = members
            .map((p) => values[cellKey(p.profileId, c.kpiId)])
            .filter((v): v is number => typeof v === "number");
          if (list.length) byKpi[c.kpiId] = formatCount(list.reduce((a, b) => a + b, 0));
        }
        const storeByKpi: Record<string, string> = {};
        for (const k of kpis) {
          if (area === "vista" && k.code === "WO" && store.vistaWo > 0)
            storeByKpi[k.kpiId] = formatCount(store.vistaWo);
          if (area === "sole" && k.code === "PZ_SOLE" && store.solePieces > 0)
            storeByKpi[k.kpiId] = formatCount(store.solePieces);
        }
        return {
          area,
          members,
          rows,
          columns,
          totals: {
            hours: formatCount(members.reduce((s, p) => s + p.plannedHours, 0)),
            byKpi,
          },
          storeTargets: Object.keys(storeByKpi).length ? storeByKpi : null,
        };
      }),
    [people, values, sets, kpis, showMixed, store.vistaWo, store.solePieces],
  );

  const getText = React.useCallback(
    (profileId: string, kpiId: string) => {
      const v = values[cellKey(profileId, kpiId)];
      return typeof v === "number" ? formatCount(v) : "";
    },
    [values],
  );

  /** Scrive (o toglie, se vuoto) l'obiettivo di una persona per una voce. */
  const onCell = React.useCallback((profileId: string, kpiId: string, raw: string): boolean => {
    const v = parseCount(raw);
    if (v === "invalid") {
      setResult({ ok: false, message: "Negli obiettivi scrivi un numero (es. 12)." });
      return false;
    }
    setValues((prev) => {
      const next = { ...prev };
      if (v === null) delete next[cellKey(profileId, kpiId)];
      else next[cellKey(profileId, kpiId)] = v;
      return next;
    });
    setResult(null);
    setDirty(true);
    return true;
  }, []);

  const onComment = React.useCallback((profileId: string, body: string) => {
    setComments((prev) => ({ ...prev, [profileId]: body.slice(0, 4000) }));
    setDirty(true);
  }, []);

  /* ------------------------------------------------- azioni */

  const onPropose = () => {
    const out = fillProposals({ store, people, kpis, sets, values });
    setValues(out.values);
    if (out.filled) setDirty(true);
    setResult({
      ok: true,
      message: out.filled
        ? `Riempite ${out.filled} ${out.filled === 1 ? "cella vuota" : "celle vuote"} con la proposta automatica: controlla, correggi o cancella quello che non ti serve, poi conferma.`
        : "Nessuna cella vuota da proporre. Le proposte usano i valori fissi delle voci, le «% di …» sui numeri già scritti e, se li hai inseriti, i numeri della produttività oraria.",
    });
  };

  const onClearArea = (area: Area) => {
    const members = people.filter((p) => areaOf(p.zone) === area);
    if (
      !confirm(
        `Svuotare tutti gli obiettivi della tabella ${AREA_LABEL[area]} per questa settimana? Diventa definitivo solo con «Conferma e avvisa».`,
      )
    )
      return;
    setValues((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(
          ([key]) => !members.some((p) => key.startsWith(`${p.profileId}|`)),
        ),
      ),
    );
    setDirty(true);
  };

  const onAddKpi = async (area: Area, label: string) => {
    const res = await quickAddKpi(label, area);
    if (res.ok) {
      setResult(res);
      if (res.data?.id) setJustAdded({ area, kpiId: res.data.id });
      // La colonna nuova arriva con il refresh; i numeri già scritti restano.
      router.refresh();
    }
    return res;
  };

  const onRemoveColumn = (area: Area, column: TargetsColumn) => {
    const members = people.filter((p) => areaOf(p.zone) === area);
    const clear = () => {
      setValues((prev) => {
        const next = { ...prev };
        for (const p of members) delete next[cellKey(p.profileId, column.kpiId)];
        return next;
      });
      setDirty(true);
      setConfirmRemove(null);
    };
    // Una colonna «mista» non fa parte del gruppo: basta svuotarla.
    if (column.mixed) {
      clear();
      setManageResult({ ok: true, message: `Colonna «${column.label}» svuotata.` });
      return;
    }
    const set = sets.find((s) => s.name === AREA_LABEL[area]);
    if (!set) return;
    startTransition(async () => {
      const res = await removeGroupItem(set.id, column.kpiId);
      setManageResult(
        res.ok
          ? {
              ok: true,
              message: `Colonna «${column.label}» tolta dalla tabella ${AREA_LABEL[area]}.`,
            }
          : res,
      );
      if (res.ok) {
        clear();
        router.refresh();
      }
    });
  };

  const onConfirm = () => {
    if (invalid.length) {
      setResult({ ok: false, message: "Controlla i numeri della produttività oraria." });
      return;
    }
    const here = new Set(people.map((p) => p.profileId));
    const cells = Object.entries(values)
      .map(([key, target]) => {
        const [profileId, kpiId] = key.split("|");
        return { profileId, kpiId, target, overridden: true };
      })
      .filter((c) => here.has(c.profileId) && activeKpiIds.has(c.kpiId));
    startTransition(async () => {
      const res = await confirmAssignment({
        weekStart,
        store: {
          ...store,
          vistaWo: Math.round(store.vistaWo),
          solePieces: Math.round(store.solePieces),
          lacPieces: Math.round(store.lacPieces),
        },
        cells,
        profileIds: people.map((p) => p.profileId),
        comments: people
          .filter(
            (p) =>
              changedComments.has(p.profileId) ||
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
              s[f.key] ? formatAmount(s[f.key] ?? 0) : "",
            ]),
          ),
        }));
      }
      const here = new Set(people.map((p) => p.profileId));
      const targets = prev.targets.filter(
        (t) => here.has(t.profileId) && activeKpiIds.has(t.kpiId),
      );
      setValues(Object.fromEntries(targets.map((t) => [cellKey(t.profileId, t.kpiId), t.target])));
      setDirty(true);
      const n = new Set(targets.map((t) => t.profileId)).size;
      setResult({
        ok: true,
        message: `Copiati gli obiettivi della settimana prima${n ? ` (${n} ${n === 1 ? "persona" : "persone"})` : ""}: controlla e conferma.`,
      });
    });
  };

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-light tracking-tight">
              Obiettivi della settimana
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Due tabelle, Vista e Sole, ciascuna con le proprie voci: clicca su un campo e scrivi
              il numero, svuotalo per togliere l&apos;obiettivo (Tab passa al campo a destra, Invio
              a quello sotto). Ognuno vede solo le voci della sua area, più gli obiettivi «misti»
              che gli assegni. Alla fine «Conferma e avvisa».
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
            <Button variant="secondary" size="sm" onClick={onPropose} disabled={pending}>
              <Sparkles aria-hidden /> Proponi in automatico
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={pending || people.length === 0}>
              <Send aria-hidden /> Conferma e avvisa
            </Button>
          </div>
        </div>
        <FormMessage result={result} />

        {people.length === 0 ? (
          <p className="py-10 font-display text-2xl font-light text-subtle">
            Nessuna persona attiva: aggiungile da Amministrazione → Dipendenti.
          </p>
        ) : null}

        {tables.map((t) => {
          const other: Area = t.area === "vista" ? "sole" : "vista";
          return (
            <section
              key={t.area}
              aria-labelledby={`tab-${t.area}`}
              className="mt-4 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id={`tab-${t.area}`} className="flex items-center gap-2">
                  <Badge tone={t.area}>{AREA_LABEL[t.area]}</Badge>
                  <span className="text-sm text-muted">
                    {t.area === "vista" ? "Vista e jolly · " : ""}
                    {t.rows.length} {t.rows.length === 1 ? "persona" : "persone"}
                  </span>
                </h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Checkbox
                    className="min-h-9 py-1"
                    label={`Mostra anche le voci del ${AREA_LABEL[other]} (obiettivi misti)`}
                    checked={showMixed[t.area]}
                    onChange={(e) => setShowMixed((m) => ({ ...m, [t.area]: e.target.checked }))}
                  />
                  <AddColumn
                    title={`Nuova colonna ${AREA_LABEL[t.area]}`}
                    description={`Una voce in più nella tabella ${AREA_LABEL[t.area]}: la vedranno le persone di quest'area. Se esiste già nell'altra tabella, scrivi lo stesso nome per averla anche qui.`}
                    fieldLabel="Nome della voce"
                    placeholder="Es. Lenti a contatto"
                    maxLength={60}
                    disabled={pending}
                    onAdd={(name) => onAddKpi(t.area, name)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending || t.columns.length === 0}
                    onClick={() => {
                      setManageResult(null);
                      setConfirmRemove(null);
                      setManaging(t.area);
                    }}
                  >
                    <Columns3 aria-hidden /> Gestisci colonne
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending || Object.keys(t.totals.byKpi).length === 0}
                    onClick={() => onClearArea(t.area)}
                  >
                    <Eraser aria-hidden /> Svuota la tabella
                  </Button>
                </div>
              </div>
              {t.rows.length === 0 ? (
                <p className="rounded-md border border-line px-4 py-6 text-sm text-muted">
                  Nessuna persona in quest&apos;area.
                </p>
              ) : (
                <TargetsTable
                  tableId={`tab-${t.area}`}
                  ariaLabel={`Obiettivi ${AREA_LABEL[t.area]} della week ${props.weekNumber}`}
                  rows={t.rows}
                  columns={t.columns}
                  getText={getText}
                  comments={comments}
                  changedComments={changedComments}
                  totals={t.totals}
                  storeTargets={t.storeTargets}
                  disabled={pending}
                  onCell={onCell}
                  onComment={onComment}
                  onExpandComment={setEditingComment}
                />
              )}
            </section>
          );
        })}

        <p className="text-xs text-muted">
          Le ore vengono dai turni della settimana
          {props.scheduleStatus !== "published"
            ? " (non ancora pubblicati: potrebbero cambiare)"
            : ""}
          . Per rinominare o riordinare le voci, o cambiare la regola delle proposte:{" "}
          <Link href={`/admin/obiettivi/${weekStart}/voci`} className="link-underline">
            scheda Voci
          </Link>
          .
        </p>
      </section>

      <details
        className="group rounded-lg border border-line"
        open={calcInitiallyOpen || undefined}
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <Calculator className="size-5 stroke-[1.5]" aria-hidden />
          <span className="flex-1">
            <span className="block font-medium">Produttività oraria del negozio</span>
            <span className="block text-sm text-muted">
              {productivity > 0
                ? `${formatEurPerHour(productivity)} · fatturato totale ÷ ore lavorate (riferimento ${PRODUCTIVITY_TARGET.min}–${PRODUCTIVITY_TARGET.max} €/h)`
                : "Inserisci ore e fatturato di vista, sole, lenti a contatto e altro: fatturato totale ÷ ore lavorate."}
            </span>
          </span>
          <span className="text-sm text-muted group-open:hidden">Apri</span>
          <span className="hidden text-sm text-muted group-open:inline">Chiudi</span>
        </summary>
        <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Card>
            <CardTitle>Numeri della settimana</CardTitle>
            <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
              {(["ore", "vista", "sole", "lac", "altro"] as const).map((group) => (
                <fieldset key={group} className="flex flex-col gap-4">
                  <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
                    {group === "vista" || group === "sole" ? (
                      <Badge tone={group}>{GROUP_TITLE[group]}</Badge>
                    ) : (
                      GROUP_TITLE[group]
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
            <CardTitle className="mb-0">Produttività oraria</CardTitle>
            <div>
              <p className="eyebrow">Totale negozio</p>
              <p className="mt-1 font-display text-4xl font-light nums">
                {formatEurPerHour(productivity)}
              </p>
              <p
                className={cn(
                  "mt-1 text-sm",
                  level === "below"
                    ? "text-warning"
                    : level === "none"
                      ? "text-muted"
                      : "text-success",
                )}
              >
                {level === "none"
                  ? `Una buona produttività è intorno a ${PRODUCTIVITY_TARGET.min}–${PRODUCTIVITY_TARGET.max} €/h.`
                  : level === "below"
                    ? `Sotto il riferimento di ${PRODUCTIVITY_TARGET.min}–${PRODUCTIVITY_TARGET.max} €/h.`
                    : level === "ok"
                      ? `In linea con il riferimento di ${PRODUCTIVITY_TARGET.min}–${PRODUCTIVITY_TARGET.max} €/h.`
                      : `Sopra il riferimento di ${PRODUCTIVITY_TARGET.min}–${PRODUCTIVITY_TARGET.max} €/h.`}
              </p>
              <p className="mt-1 text-xs text-muted nums">
                {formatAmount(totalRevenue(store))} € di fatturato ÷ {formatCount(store.totalHours)}{" "}
                ore
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
              {(
                [
                  ["Vista", store.vistaValueEur],
                  ["Sole", store.soleValueEur],
                  ["Lenti a contatto", store.lacValueEur],
                  ["Altro", store.otherValueEur],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="eyebrow">{label}</dt>
                  <dd className="mt-0.5 nums">{formatEurPerHour(perHour(value))}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted">
              «Proponi in automatico» usa €/ora di vista e sole: per ciascuno, €/ora × ore dei suoi
              turni ÷ prezzo medio.
            </p>
          </Card>
        </div>
      </details>

      <Dialog open={managing !== null} onOpenChange={(o) => !o && !pending && setManaging(null)}>
        {managing ? (
          <DialogContent
            title={`Colonne della tabella ${AREA_LABEL[managing]}`}
            description="Togli le voci che non ti servono: i numeri già inseriti restano nello storico e puoi rimetterle quando vuoi con «Aggiungi colonna»."
          >
            <div className="flex flex-col gap-4">
              <ul className="flex max-h-[55vh] flex-col overflow-y-auto border-t border-line">
                {(tables.find((t) => t.area === managing)?.columns ?? []).map((c) => (
                  <li key={c.kpiId} className="border-b border-line py-2.5">
                    {confirmRemove === c.kpiId ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm">
                          <span className="font-medium">Togliere «{c.label}»?</span>{" "}
                          <span className="text-muted">
                            {c.mixed
                              ? `È una voce dell'altra area: si svuotano i suoi obiettivi di questa settimana per le persone del ${AREA_LABEL[managing]}.`
                              : `Esce dalla tabella e dai fogli di chi lavora nel ${AREA_LABEL[managing]}; i suoi obiettivi di questa settimana si svuotano.`}
                          </span>
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() => onRemoveColumn(managing, c)}
                          >
                            <Trash2 aria-hidden /> {c.mixed ? "Sì, svuota" : "Sì, togli"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirmRemove(null)}
                          >
                            No, tienila
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 text-sm">
                          <span className={cn(c.strong && "font-semibold")}>{c.label}</span>
                          {c.mixed ? (
                            <span className="ml-2 text-xs text-subtle">altra area</span>
                          ) : null}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          aria-label={`${c.mixed ? "Svuota" : "Togli"} la colonna «${c.label}»`}
                          onClick={() => {
                            setManageResult(null);
                            setConfirmRemove(c.kpiId);
                          }}
                        >
                          <Trash2 aria-hidden /> {c.mixed ? "Svuota" : "Togli"}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <FormMessage result={manageResult} />
              <div className="flex justify-end">
                <DialogClose asChild>
                  <Button variant="secondary" disabled={pending}>
                    Fatto
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

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
