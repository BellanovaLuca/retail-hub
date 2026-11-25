"use client";

import { format, getISOWeek, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { FileText, Save, Trash2, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  deleteResponsibility,
  quickAddResponsibility,
  saveWeekAssignments,
  setResponsibilityActive,
  setResponsibilityDays,
} from "@/app/admin/comunicazioni/responsabilita/actions";
import { AddColumn } from "@/components/ui/add-column";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormMessage, Select } from "@/components/ui/form";
import { PersonDot } from "@/components/ui/table";
import type { WeekPlannerItem } from "@/lib/data/responsibilities";
import {
  normalizeDays,
  normalizePersonDays,
  samePersonDays,
  type PersonDays,
} from "@/lib/responsibilities/assignment";
import { cn } from "@/lib/utils";
import { scheduleLabel } from "./format";
import { WeekDayGrid } from "./week-day-grid";

type Person = { id: string; name: string; color: string | null };

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Casella «tutta la settimana»: piena con 7 giorni, a metà con alcuni. */
function WeekCheckbox({
  count,
  ...props
}: { count: number } & Omit<React.ComponentProps<"input">, "type" | "checked">) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < 7;
  }, [count]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="size-5 accent-foreground"
      checked={count === 7}
      {...props}
    />
  );
}

/**
 * Assegnazione delle responsabilità della settimana, per persona e per giorno: a sinistra
 * l'elenco delle responsabilità, a destra — per quella scelta — una casella per ogni persona e
 * ogni giorno. Sotto, il riepilogo «chi fa cosa, giorno per giorno» (lo stesso che vedono i
 * dipendenti), aggiornato mentre si spunta.
 */
export function WeekPlanner({
  weekStart,
  editable,
  items,
  people,
  days,
  today,
  onShift,
}: {
  weekStart: string;
  /** false per le settimane passate (sola lettura). */
  editable: boolean;
  items: WeekPlannerItem[];
  people: Person[];
  /** Le sette date della settimana, da lunedì. */
  days: string[];
  today: string;
  /** Per data: chi è in turno (null = turni non pubblicati). */
  onShift: Record<string, string[] | null>;
}) {
  const router = useRouter();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const initial = React.useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, i.personDays])),
    [items],
  );
  // Solo le attività toccate: le altre valgono come sono salvate.
  const [plans, setPlans] = React.useState<Record<string, PersonDays>>({});
  const planOf = (id: string): PersonDays => plans[id] ?? initial[id] ?? {};
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [removing, setRemoving] = React.useState<WeekPlannerItem | null>(null);
  // Giorni delle attività «per tutti», non ancora salvati.
  const [dayDrafts, setDayDrafts] = React.useState<Record<string, number[]>>({});

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const changed = items.filter(
    (i) => !i.allStaff && plans[i.id] && !samePersonDays(plans[i.id], initial[i.id] ?? {}),
  );
  const week = getISOWeek(parseISO(weekStart));
  const locked = !editable || pending;

  /** Aggiunge o toglie una responsabilità: le spunte non ancora salvate restano. */
  const manage = (run: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await run();
      setResult(res);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });

  const setDaysFor = (itemId: string, personId: string, next: (now: number[]) => number[]) => {
    setResult(null);
    setPlans((s) => {
      const cur = s[itemId] ?? initial[itemId] ?? {};
      return { ...s, [itemId]: { ...cur, [personId]: normalizeDays(next(cur[personId] ?? [])) } };
    });
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveWeekAssignments({
        weekStart,
        changes: changed.map((c) => ({
          responsibilityId: c.id,
          personDays: normalizePersonDays(plans[c.id] ?? {}),
        })),
      });
      setResult(res);
      if (res.ok) router.refresh();
    });

  const pick = (id: string) => {
    setSelectedId(id);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const addButton = (
    <AddColumn
      buttonLabel="Aggiungi responsabilità"
      title="Nuova responsabilità"
      description="Si aggiunge all'elenco: poi spunti chi se ne occupa e in quali giorni."
      fieldLabel="Nome della responsabilità"
      placeholder="Es. Controllo vetrine"
      disabled={pending}
      onAdd={async (name) => {
        const res = await quickAddResponsibility(name);
        if (res.ok) {
          setResult({
            ok: true,
            message: `${res.message} Ora spunta chi se ne occupa e in quali giorni.`,
          });
          setSelectedId(res.data?.id ?? null);
          router.refresh();
        }
        return res;
      }}
    />
  );

  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        <p className="py-2 font-display text-xl font-light text-subtle">
          Nessuna responsabilità attiva: aggiungi la prima.
        </p>
        <div>{addButton}</div>
        <FormMessage result={result} />
      </div>
    );
  }

  /** Riga di riepilogo sotto il nome, nell'elenco. */
  const summaryOf = (item: WeekPlannerItem): { text: string; empty: boolean } => {
    if (item.allStaff)
      return { text: `Per tutti · ${scheduleLabel(item.scheduleDays)}`, empty: false };
    const plan = normalizePersonDays(planOf(item.id));
    const assigned = people.filter((p) => plan[p.id]);
    if (assigned.length === 0) return { text: "Nessuno assegnato", empty: true };
    return {
      text: assigned.map((p) => `${p.name} (${scheduleLabel(plan[p.id])})`).join(" · "),
      empty: false,
    };
  };

  const plan = planOf(selected.id);
  const isChanged = (id: string) => changed.some((c) => c.id === id);
  const sourceNote = selected.allStaff
    ? null
    : selected.source === "inherited" && selected.fromWeek
      ? `Ripresa dalla week ${getISOWeek(parseISO(selected.fromWeek))}: se la cambi, vale da questa settimana in poi.`
      : selected.source === "standing" && Object.keys(selected.personDays).length
        ? "Per ora valgono responsabile e supporti della scheda, nei giorni previsti."
        : null;
  const draftDays = dayDrafts[selected.id] ?? selected.scheduleDays;
  const draftChanged = draftDays.join() !== selected.scheduleDays.join();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
        {/* Elenco delle responsabilità (su schermi stretti: menu a tendina). */}
        <div className="flex flex-col gap-3">
          <div className="lg:hidden">
            <label htmlFor="resp-scelta" className="mb-1.5 block eyebrow">
              Responsabilità
            </label>
            <Select
              id="resp-scelta"
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {items.map((i) => {
                const s = summaryOf(i);
                return (
                  <option key={i.id} value={i.id}>
                    {i.title}
                    {s.empty ? " — nessuno" : ""}
                    {isChanged(i.id) ? " •" : ""}
                  </option>
                );
              })}
            </Select>
          </div>
          <ul
            aria-label="Responsabilità"
            className="hidden flex-col rounded-md border border-line lg:flex"
          >
            {items.map((i) => {
              const s = summaryOf(i);
              const on = i.id === selected.id;
              return (
                <li key={i.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => setSelectedId(i.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors duration-150",
                      on
                        ? "bg-foreground text-background"
                        : "hover:bg-surface focus-visible:bg-surface",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="min-w-0 truncate">{i.title}</span>
                      {isChanged(i.id) ? (
                        <span
                          className={cn(
                            "shrink-0 text-[0.625rem] font-semibold uppercase",
                            on ? "text-background" : "text-warning",
                          )}
                        >
                          da salvare
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "line-clamp-2 text-xs",
                        on ? "text-background/80" : s.empty ? "text-warning" : "text-muted",
                      )}
                    >
                      {s.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div>{addButton}</div>
        </div>

        {/* Assegnazione della responsabilità scelta. */}
        <div ref={panelRef} className="min-w-0 scroll-mt-24 rounded-md border border-line">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h3 className="font-display text-xl font-medium tracking-tight">{selected.title}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {selected.allStaff
                  ? "Attività per tutti: la fa chi è in turno."
                  : "Spunta, per ogni persona, i giorni in cui se ne occupa."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/admin/comunicazioni/responsabilita/${selected.id}`}>
                  <FileText aria-hidden /> Scheda e procedura
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setRemoving(selected)}
              >
                <Trash2 aria-hidden /> Togli
              </Button>
            </div>
          </div>

          {selected.allStaff ? (
            <div className="flex flex-col gap-4 px-4 py-4">
              <p className="text-sm text-muted">In quali giorni va fatta:</p>
              <div
                className="grid max-w-xl grid-cols-7 gap-1.5"
                role="group"
                aria-label="Giorni previsti"
              >
                {DAY_SHORT.map((label, i) => {
                  const day = i + 1;
                  const on = draftDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      disabled={pending}
                      onClick={() =>
                        setDayDrafts((d) => ({
                          ...d,
                          [selected.id]: on
                            ? draftDays.filter((x) => x !== day)
                            : normalizeDays([...draftDays, day]),
                        }))
                      }
                      className={cn(
                        "flex min-h-11 items-center justify-center rounded-md border text-sm",
                        on
                          ? "border-foreground bg-foreground font-medium text-background"
                          : "border-line text-muted hover:border-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  disabled={pending || !draftChanged || draftDays.length === 0}
                  onClick={() =>
                    manage(
                      () => setResponsibilityDays(selected.id, draftDays),
                      () =>
                        setDayDrafts((d) => {
                          const rest = { ...d };
                          delete rest[selected.id];
                          return rest;
                        }),
                    )
                  }
                >
                  <Save aria-hidden /> Salva i giorni
                </Button>
                {draftDays.length === 0 ? (
                  <span className="text-xs text-danger">Scegli almeno un giorno.</span>
                ) : null}
              </div>
              <p className="max-w-xl text-xs text-muted">
                Per assegnarla a persone precise, apri «Scheda e procedura» e togli «Per tutti».
              </p>
            </div>
          ) : (
            <>
              {/* relative: gli elementi nascosti (sr-only) restano dentro l'area scorrevole. */}
              <div className="relative overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">
                    Giorni di «{selected.title}» per ciascuna persona nella week {week}
                  </caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 z-10 min-w-28 border-b border-line bg-background px-4 py-2 text-left align-bottom eyebrow font-semibold sm:min-w-40"
                      >
                        Persona
                      </th>
                      {days.map((d, i) => (
                        <th
                          key={d}
                          scope="col"
                          aria-current={d === today ? "date" : undefined}
                          className={cn(
                            "w-11 min-w-11 border-b border-l border-line px-1 py-2 text-center align-bottom text-xs font-medium sm:w-14 sm:min-w-14",
                            d === today && "shadow-[inset_0_3px_0_var(--foreground)]",
                          )}
                        >
                          {DAY_SHORT[i]}
                          <span className="block font-normal text-subtle nums">
                            {format(parseISO(d), "d", { locale: it })}
                          </span>
                        </th>
                      ))}
                      <th
                        scope="col"
                        className="w-16 min-w-16 border-b border-l border-line px-2 py-2 text-center align-bottom text-xs font-medium sm:w-24 sm:min-w-24"
                      >
                        Tutta la settimana
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => {
                      const mine = plan[p.id] ?? [];
                      return (
                        <tr key={p.id} className="hover:bg-surface/60">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 border-b border-line bg-background px-4 py-1 text-left font-normal whitespace-nowrap"
                          >
                            <span className="flex items-center gap-2">
                              <PersonDot color={p.color} /> {p.name}
                            </span>
                          </th>
                          {days.map((d, i) => {
                            const day = i + 1;
                            const on = mine.includes(day);
                            const shift = onShift[d];
                            const away = !!shift && !shift.includes(p.id);
                            return (
                              <td
                                key={d}
                                title={away ? "Non in turno questo giorno" : undefined}
                                className={cn(
                                  "border-b border-l border-line p-0 text-center",
                                  away && "hatch text-line-strong",
                                  on && (away ? "bg-danger/10" : "bg-foreground/[0.06]"),
                                )}
                              >
                                <label className="flex min-h-11 cursor-pointer items-center justify-center has-disabled:cursor-default">
                                  <input
                                    type="checkbox"
                                    className="size-5 accent-foreground"
                                    checked={on}
                                    disabled={locked}
                                    onChange={(e) =>
                                      setDaysFor(selected.id, p.id, (now) =>
                                        e.target.checked
                                          ? [...now, day]
                                          : now.filter((x) => x !== day),
                                      )
                                    }
                                    aria-label={`${p.name} · ${DAY_SHORT[i]}${away ? " (non in turno)" : ""}`}
                                  />
                                </label>
                              </td>
                            );
                          })}
                          <td className="border-b border-l border-line p-0 text-center">
                            <label className="flex min-h-11 cursor-pointer items-center justify-center has-disabled:cursor-default">
                              <WeekCheckbox
                                count={mine.length}
                                disabled={locked}
                                onChange={(e) =>
                                  setDaysFor(selected.id, p.id, () =>
                                    e.target.checked ? ALL_DAYS : [],
                                  )
                                }
                                aria-label={`${p.name} · tutta la settimana`}
                              />
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-background px-4 py-2 text-left eyebrow font-semibold"
                      >
                        Persone
                      </th>
                      {days.map((d, i) => {
                        const n = people.filter((p) => plan[p.id]?.includes(i + 1)).length;
                        return (
                          <td
                            key={d}
                            className={cn(
                              "border-l border-line px-1 py-2 text-center nums",
                              n ? "text-muted" : "text-subtle",
                            )}
                          >
                            {n || "—"}
                          </td>
                        );
                      })}
                      <td className="border-l border-line" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
                Tratteggio = la persona non è in turno quel giorno (dai turni pubblicati).
                {sourceNote ? ` ${sourceNote}` : ""}
              </p>
            </>
          )}
        </div>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || changed.length === 0}>
            <Save aria-hidden /> Salva e avvisa
          </Button>
          {changed.length ? (
            <>
              <Badge tone="warning">
                {changed.length === 1
                  ? "1 responsabilità da salvare"
                  : `${changed.length} responsabilità da salvare`}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setPlans({});
                  setResult(null);
                }}
              >
                <Undo2 aria-hidden /> Annulla modifiche
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted">
              Le scelte valgono anche per le settimane seguenti finché non le cambi; chi riceve
              un&apos;attività nuova o giorni diversi viene avvisato.
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Settimana passata: le assegnazioni restano in sola lettura.
        </p>
      )}
      <FormMessage result={result} />

      <section aria-labelledby="riepilogo-settimana" className="flex flex-col gap-3">
        <div>
          <h3 id="riepilogo-settimana" className="eyebrow">
            Riepilogo · chi fa cosa, giorno per giorno
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            È quello che vede ogni dipendente. Clicca un&apos;attività per aprirne
            l&apos;assegnazione.
            {changed.length ? " Comprende le modifiche non ancora salvate." : ""}
          </p>
        </div>
        <WeekDayGrid
          caption={`Responsabilità di ciascuno, giorno per giorno, nella week ${week}`}
          days={days}
          today={today}
          people={people}
          items={items
            .filter((i) => !i.allStaff)
            .map((i) => ({ id: i.id, title: i.title, personDays: planOf(i.id) }))}
          selectedId={selected.id}
          onPick={pick}
          onShift={onShift}
        />
        {items.some((i) => i.allStaff) ? (
          <p className="text-xs text-muted">
            <span className="mr-2 eyebrow">Per tutti</span>
            {items
              .filter((i) => i.allStaff)
              .map((i) => `${i.title} (${scheduleLabel(i.scheduleDays)})`)
              .join(" · ")}
          </p>
        ) : null}
        <p className="text-xs text-muted">
          In rosso: attività assegnate in un giorno in cui la persona non è in turno.
        </p>
      </section>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && !pending && setRemoving(null)}>
        {removing ? (
          <DialogContent
            title={`Togliere «${removing.title}»?`}
            description="Scegli se conservare lo storico delle spunte o eliminare tutto."
          >
            <div className="flex flex-col gap-4 text-sm">
              <Button
                variant="secondary"
                disabled={pending}
                className="h-auto justify-start py-3 text-left whitespace-normal"
                onClick={() =>
                  manage(
                    () => setResponsibilityActive(removing.id, false),
                    () => setRemoving(null),
                  )
                }
              >
                <X aria-hidden />
                <span>
                  <span className="block font-medium">Togli dall&apos;elenco</span>
                  <span className="block text-xs font-normal text-muted">
                    Sparisce per tutti; lo storico resta e puoi rimetterla dall&apos;elenco
                    «Attività» più sotto.
                  </span>
                </span>
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                className="h-auto justify-start py-3 text-left whitespace-normal"
                onClick={() =>
                  manage(
                    () => deleteResponsibility(removing.id),
                    () => setRemoving(null),
                  )
                }
              >
                <Trash2 aria-hidden />
                <span>
                  <span className="block font-medium">Elimina definitivamente</span>
                  <span className="block text-xs font-normal">
                    Si eliminano anche tutte le sue spunte e assegnazioni: non si può annullare.
                  </span>
                </span>
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending}>
                  Annulla
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
