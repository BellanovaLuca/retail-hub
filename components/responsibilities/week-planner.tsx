"use client";

import { getISOWeek, parseISO } from "date-fns";
import { Pencil, Plus, Save, Trash2, Undo2, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PersonDot } from "@/components/ui/table";
import type { WeekPlannerColumn } from "@/lib/data/responsibilities";
import { cn } from "@/lib/utils";
import { DAY_LETTERS, scheduleLabel } from "./format";

type Person = { id: string; name: string; color: string | null };

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * Griglia "chi fa cosa questa settimana": le persone in riga, le attività in colonna. Si spunta
 * quali attività farà ciascuno nella settimana; un'attività può andare a una o più persone.
 */
export function WeekPlanner({
  weekStart,
  editable,
  columns,
  people,
  allStaff,
}: {
  weekStart: string;
  /** false per le settimane passate (sola lettura). */
  editable: boolean;
  columns: WeekPlannerColumn[];
  people: Person[];
  allStaff: { id: string; title: string }[];
}) {
  const router = useRouter();
  const initial = React.useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.profileIds])),
    [columns],
  );
  const [sets, setSets] = React.useState<Record<string, string[]>>(initial);
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [removing, setRemoving] = React.useState<WeekPlannerColumn | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  // Giorni della settimana di una responsabilità (finestra di modifica).
  const [daysOf, setDaysOf] = React.useState<{ column: WeekPlannerColumn; days: number[] } | null>(
    null,
  );
  // La colonna appena aggiunta finisce in fondo a destra: la si porta in vista e la si evidenzia.
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!justAdded) return;
    const el = document.getElementById(`resp-col-${justAdded}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    const timer = setTimeout(() => setJustAdded(null), 4000);
    return () => clearTimeout(timer);
  }, [justAdded, columns]);

  /** Aggiunge o toglie una colonna (responsabilità): le spunte non ancora salvate restano. */
  const manage = (run: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await run();
      setResult(res);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });

  const addForm = (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        startTransition(async () => {
          const res = await quickAddResponsibility(newTitle);
          setResult(
            res.ok
              ? {
                  ok: true,
                  message: `${res.message} È l'ultima colonna a destra: spunta chi se ne occupa.`,
                }
              : res,
          );
          if (res.ok) {
            setNewTitle("");
            setJustAdded(res.data?.id ?? null);
            router.refresh();
          }
        });
      }}
    >
      <Input
        aria-label="Nome della nuova responsabilità"
        placeholder="Nuova responsabilità (es. Controllo vetrine)"
        value={newTitle}
        maxLength={120}
        onChange={(e) => setNewTitle(e.target.value)}
        disabled={pending}
        className="w-full sm:w-80"
      />
      <Button type="submit" variant="secondary" disabled={pending || !newTitle.trim()}>
        <Plus aria-hidden /> Aggiungi colonna
      </Button>
    </form>
  );

  const changed = columns.filter((c) => !sameSet(sets[c.id] ?? [], initial[c.id] ?? []));
  const week = getISOWeek(parseISO(weekStart));

  const toggle = (colId: string, personId: string, on: boolean) => {
    setResult(null);
    setSets((s) => {
      const cur = s[colId] ?? [];
      return {
        ...s,
        [colId]: on
          ? [...cur.filter((id) => id !== personId), personId]
          : cur.filter((id) => id !== personId),
      };
    });
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveWeekAssignments({
        weekStart,
        changes: changed.map((c) => ({ responsibilityId: c.id, profileIds: sets[c.id] ?? [] })),
      });
      setResult(res);
      if (res.ok) router.refresh();
    });

  if (columns.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="py-2 font-display text-xl font-light text-subtle">
          Nessuna responsabilità attiva: aggiungi qui sotto la prima colonna.
        </p>
        {addForm}
        <FormMessage result={result} />
      </div>
    );
  }

  const sourceLabel = (c: WeekPlannerColumn) =>
    c.source === "week"
      ? null
      : c.source === "inherited" && c.fromWeek
        ? `come week ${getISOWeek(parseISO(c.fromWeek))}`
        : c.profileIds.length
          ? "dalla scheda"
          : null;

  return (
    <div className="flex flex-col gap-4">
      {addForm}
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-max min-w-full border-collapse text-sm">
          <caption className="sr-only">Attività di ciascuna persona nella week {week}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-40 border-b border-line bg-background px-3 py-2 text-left align-bottom eyebrow font-semibold"
              >
                Persona
              </th>
              {columns.map((c) => {
                const note = sourceLabel(c);
                const isChanged = changed.includes(c);
                return (
                  <th
                    key={c.id}
                    id={`resp-col-${c.id}`}
                    scope="col"
                    className={cn(
                      "w-28 min-w-28 border-b border-l border-line px-2 py-2 text-center align-bottom font-medium",
                      isChanged && "bg-surface",
                      justAdded === c.id &&
                        "bg-foreground/[0.08] shadow-[inset_0_3px_0_var(--foreground)]",
                    )}
                  >
                    <span className="line-clamp-3 leading-tight">{c.title}</span>
                    <button
                      type="button"
                      className="mx-auto mt-1.5 flex gap-[3px] rounded-sm px-1 py-0.5 text-[0.625rem] font-semibold hover:bg-surface disabled:opacity-60"
                      aria-label={`Giorni di «${c.title}»: ${scheduleLabel(c.scheduleDays)}. Modifica`}
                      title={`${scheduleLabel(c.scheduleDays)} · clicca per cambiare i giorni`}
                      disabled={pending}
                      onClick={() => setDaysOf({ column: c, days: c.scheduleDays })}
                    >
                      {DAY_LETTERS.map((letter, i) => (
                        <span
                          key={i}
                          aria-hidden
                          className={
                            c.scheduleDays.includes(i + 1) ? "text-foreground" : "text-line-strong"
                          }
                        >
                          {letter}
                        </span>
                      ))}
                    </button>
                    {note ? (
                      <span className="mt-1 block text-[0.6875rem] font-normal text-subtle">
                        {note}
                      </span>
                    ) : null}
                    <span className="mt-1 flex justify-center gap-1">
                      <Link
                        href={`/admin/comunicazioni/responsabilita/${c.id}`}
                        className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground"
                        aria-label={`Apri la scheda di «${c.title}» (procedura e allegati)`}
                        title="Apri la scheda: procedura e allegati"
                      >
                        <Pencil className="size-3.5 stroke-[1.5]" aria-hidden />
                      </Link>
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-danger disabled:opacity-40"
                        aria-label={`Togli la colonna «${c.title}»`}
                        title="Togli questa colonna"
                        disabled={pending}
                        onClick={() => setRemoving(c)}
                      >
                        <X className="size-4 stroke-[1.5]" aria-hidden />
                      </button>
                    </span>
                  </th>
                );
              })}
              <th
                scope="col"
                className="border-b border-l border-line px-3 py-2 text-right align-bottom eyebrow font-semibold"
              >
                Totale
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const count = columns.filter((c) => sets[c.id]?.includes(p.id)).length;
              return (
                <tr key={p.id} className="hover:bg-surface/60">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-line bg-background px-3 py-1 text-left font-normal whitespace-nowrap"
                  >
                    <span className="flex items-center gap-2">
                      <PersonDot color={p.color} /> {p.name}
                    </span>
                  </th>
                  {columns.map((c) => {
                    const on = sets[c.id]?.includes(p.id) ?? false;
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          "border-b border-l border-line p-0 text-center",
                          on && "bg-foreground/[0.06]",
                        )}
                      >
                        <label className="flex min-h-11 cursor-pointer items-center justify-center has-disabled:cursor-default">
                          <input
                            type="checkbox"
                            className="size-5 accent-foreground"
                            checked={on}
                            disabled={!editable || pending}
                            onChange={(e) => toggle(c.id, p.id, e.target.checked)}
                            aria-label={`${p.name} · ${c.title}`}
                          />
                        </label>
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-line px-3 text-right text-muted nums">
                    {count || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-background px-3 py-2 text-left eyebrow font-semibold"
              >
                Persone assegnate
              </th>
              {columns.map((c) => {
                const n = sets[c.id]?.length ?? 0;
                return (
                  <td
                    key={c.id}
                    className={cn(
                      "border-l border-line px-2 py-2 text-center nums",
                      n === 0 ? "text-warning" : "text-muted",
                    )}
                  >
                    {n === 0 ? "nessuno" : n}
                  </td>
                );
              })}
              <td className="border-l border-line" />
            </tr>
          </tfoot>
        </table>
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
                  ? "1 attività modificata"
                  : `${changed.length} attività modificate`}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setSets(initial);
                  setResult(null);
                }}
              >
                <Undo2 aria-hidden /> Annulla modifiche
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Settimana passata: le assegnazioni restano in sola lettura.
        </p>
      )}
      <FormMessage result={result} />

      <Dialog open={daysOf !== null} onOpenChange={(o) => !o && !pending && setDaysOf(null)}>
        {daysOf ? (
          <DialogContent
            title={`Giorni di «${daysOf.column.title}»`}
            description="In quali giorni della settimana va fatta: negli altri la casella non è prevista."
          >
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Giorni previsti">
                {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((label, i) => {
                  const day = i + 1;
                  const on = daysOf.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      disabled={pending}
                      onClick={() =>
                        setDaysOf((d) =>
                          d
                            ? {
                                ...d,
                                days: on
                                  ? d.days.filter((x) => x !== day)
                                  : [...d.days, day].sort(),
                              }
                            : d,
                        )
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setDaysOf((d) => (d ? { ...d, days: [1, 2, 3, 4, 5, 6, 7] } : d))}
                >
                  Tutti i giorni
                </Button>
                <div className="flex gap-3">
                  <DialogClose asChild>
                    <Button variant="ghost" disabled={pending}>
                      Annulla
                    </Button>
                  </DialogClose>
                  <Button
                    disabled={pending || daysOf.days.length === 0}
                    onClick={() =>
                      manage(
                        () => setResponsibilityDays(daysOf.column.id, daysOf.days),
                        () => setDaysOf(null),
                      )
                    }
                  >
                    Salva i giorni
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

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
                  <span className="block font-medium">Togli dal tabellone</span>
                  <span className="block text-xs font-normal text-muted">
                    La colonna sparisce per tutti; lo storico resta e puoi rimetterla
                    dall&apos;elenco «Attività» più sotto.
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

      <p className="max-w-3xl text-xs text-muted">
        Spunta le attività che ciascuno farà nella week {week}: un&apos;attività può andare a una o
        più persone. Nei giorni previsti la fa chi di loro è in turno. Le scelte valgono anche per
        le settimane seguenti finché non le cambi; chi riceve un&apos;attività nuova viene avvisato.
        {allStaff.length
          ? ` Per tutti, quindi non da assegnare: ${allStaff.map((a) => a.title).join(", ")}.`
          : ""}
      </p>
    </div>
  );
}
