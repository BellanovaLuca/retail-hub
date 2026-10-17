"use client";

import { Check } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { TodayDuties } from "@/lib/data/responsibilities";
import { setExtraTaskDone, toggleResponsibilityCheck } from "@/lib/responsibilities/actions";
import { cn } from "@/lib/utils";
import { dayLong, doneAtLabel } from "./format";

type Action = { kind: "resp" | "extra"; id: string; done: boolean };

/**
 * "Oggi tocca a te": responsabilità di oggi (con l'etichetta "Oggi sostituisci …" quando si
 * fa le veci del responsabile) e attività extra aperte, con la spunta "Fatto". Usabile anche
 * nella card della Home.
 */
export function TodayDutiesList({
  duties,
  viewerName,
  compact = false,
}: {
  duties: TodayDuties;
  viewerName: string;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [state, apply] = useOptimistic(duties, (s: TodayDuties, a: Action) =>
    a.kind === "resp"
      ? {
          ...s,
          responsibilities: s.responsibilities.map((r) =>
            r.id === a.id
              ? {
                  ...r,
                  done: a.done,
                  doneByName: a.done ? viewerName : null,
                  doneAt: a.done ? new Date().toISOString() : null,
                }
              : r,
          ),
        }
      : { ...s, extraTasks: s.extraTasks.filter((t) => !(t.id === a.id && a.done)) },
  );

  function run(a: Action, title: string) {
    setError(null);
    startTransition(async () => {
      apply(a);
      const res =
        a.kind === "resp"
          ? await toggleResponsibilityCheck({
              responsibilityId: a.id,
              date: duties.date,
              done: a.done,
            })
          : await setExtraTaskDone({ taskId: a.id, done: a.done });
      if (!res.ok) setError(`${title}: ${res.message}`);
    });
  }

  if (state.responsibilities.length === 0 && state.extraTasks.length === 0) {
    return (
      <p className={cn("font-display font-light text-subtle", compact ? "text-xl" : "text-2xl")}>
        Oggi nessuna responsabilità per te.
      </p>
    );
  }

  return (
    <div>
      {!duties.scheduleKnown ? (
        <p className="mb-3 text-xs text-muted">
          I turni di oggi non sono pubblicati: vale l&apos;assegnazione del tabellone.
        </p>
      ) : null}
      <ul className="border-t border-line">
        {state.responsibilities.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-line py-3">
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", r.done && "text-muted")}>{r.title}</p>
              <p className="text-xs text-muted">
                {r.label ? (
                  <span className={cn(r.role === "substitute" && "font-medium text-foreground")}>
                    {r.label}
                  </span>
                ) : (
                  "Responsabile"
                )}
                {r.done && r.doneAt
                  ? ` · fatta da ${r.doneByName ?? "—"} ${doneAtLabel(r.doneAt)}`
                  : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant={r.done ? "primary" : "secondary"}
              aria-pressed={r.done}
              onClick={() => run({ kind: "resp", id: r.id, done: !r.done }, r.title)}
              title={r.done ? "Tocca per annullare" : "Segna come fatta"}
            >
              <Check aria-hidden /> {r.done ? "Fatta" : "Fatto"}
            </Button>
          </li>
        ))}
        {state.extraTasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 border-b border-line py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.title}</p>
              <p className={cn("text-xs", t.overdue ? "text-danger" : "text-muted")}>
                Attività extra
                {t.dueDate ? ` · ${t.overdue ? "scaduta" : "entro"} ${dayLong(t.dueDate)}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run({ kind: "extra", id: t.id, done: true }, t.title)}
            >
              <Check aria-hidden /> Fatto
            </Button>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </div>
  );
}
