"use client";

import { getISOWeek, parseISO } from "date-fns";
import { Save, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { saveWeekAssignments } from "@/app/admin/comunicazioni/responsabilita/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { PersonDot } from "@/components/ui/table";
import type { WeekPlannerColumn } from "@/lib/data/responsibilities";
import { cn } from "@/lib/utils";

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
      <p className="py-6 font-display text-xl font-light text-subtle">
        Nessuna attività attiva: creane una con «Nuova attività».
      </p>
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
                    scope="col"
                    className={cn(
                      "w-28 min-w-28 border-b border-l border-line px-2 py-2 text-center align-bottom font-medium",
                      isChanged && "bg-surface",
                    )}
                  >
                    <span className="line-clamp-3 leading-tight">{c.title}</span>
                    {note ? (
                      <span className="mt-1 block text-[0.6875rem] font-normal text-subtle">
                        {note}
                      </span>
                    ) : null}
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
