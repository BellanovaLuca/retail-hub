"use client";

import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { closeExtraTask } from "@/app/admin/comunicazioni/responsabilita/actions";
import { Markdown } from "@/components/announcements/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExtraTask } from "@/lib/data/responsibilities";
import { setExtraTaskDone } from "@/lib/responsibilities/actions";
import { cn } from "@/lib/utils";
import { dayLong, doneAtLabel } from "./format";

/** Attività extra: compiti una tantum con scadenza; "Fatto" per gli assegnatari. */
export function ExtraTaskList({
  tasks,
  viewer,
  today,
  canManage = false,
}: {
  tasks: ExtraTask[];
  viewer: { id: string; name: string; isAdmin: boolean };
  today: string;
  /** Admin: mostra anche "Annulla" ed "Elimina". */
  canManage?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [list, apply] = useOptimistic(tasks, (state, t: { id: string; done: boolean }) =>
    state.map((x) =>
      x.id === t.id
        ? {
            ...x,
            status: t.done ? ("done" as const) : ("open" as const),
            doneByName: t.done ? viewer.name : null,
            doneAt: t.done ? new Date().toISOString() : null,
          }
        : x,
    ),
  );

  function set(task: ExtraTask, done: boolean) {
    setError(null);
    startTransition(async () => {
      apply({ id: task.id, done });
      const res = await setExtraTaskDone({ taskId: task.id, done });
      if (!res.ok) setError(`${task.title}: ${res.message}`);
    });
  }

  function close(task: ExtraTask, mode: "cancel" | "delete") {
    const question =
      mode === "cancel"
        ? `Annullare «${task.title}»? Resterà nello storico.`
        : `Eliminare definitivamente «${task.title}»?`;
    if (!window.confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const res = await closeExtraTask(task.id, mode);
      if (!res.ok) setError(`${task.title}: ${res.message}`);
    });
  }

  const open = list.filter((t) => t.status === "open");
  const closed = list.filter((t) => t.status !== "open");

  const item = (t: ExtraTask) => {
    const mine = t.assignees.some((a) => a.id === viewer.id);
    const canAct = mine || viewer.isAdmin;
    const overdue = t.status === "open" && !!t.dueDate && t.dueDate < today;
    return (
      <li
        key={t.id}
        className="flex flex-col gap-3 border-b border-line py-5 sm:flex-row sm:items-start"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("font-medium", t.status !== "open" && "text-muted line-through")}>
              {t.title}
            </span>
            {t.status === "cancelled" ? <Badge>Annullata</Badge> : null}
            {mine && t.status === "open" ? <Badge tone="solid">Tua</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted">
            {t.dueDate ? (
              <span className={cn(overdue && "font-medium text-danger")}>
                {overdue ? "Scaduta" : "Entro"} {dayLong(t.dueDate)}
              </span>
            ) : (
              "Senza scadenza"
            )}
            {" · "}
            {t.assignees.length > 0
              ? t.assignees.map((a) => a.name).join(", ")
              : "nessun assegnatario"}
            {t.status === "done" && t.doneAt
              ? ` · fatta da ${t.doneByName ?? "—"} ${doneAtLabel(t.doneAt)}`
              : ""}
          </p>
          {t.descriptionMd && t.status === "open" ? (
            <Markdown source={t.descriptionMd} className="mt-3 text-sm" />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canAct && t.status === "open" ? (
            <Button size="sm" onClick={() => set(t, true)}>
              <Check aria-hidden /> Fatto
            </Button>
          ) : null}
          {canAct && t.status === "done" ? (
            <Button size="sm" variant="ghost" onClick={() => set(t, false)}>
              <RotateCcw aria-hidden /> Riapri
            </Button>
          ) : null}
          {canManage && t.status === "open" ? (
            <Button size="sm" variant="ghost" onClick={() => close(t, "cancel")}>
              Annulla
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Elimina ${t.title}`}
              onClick={() => close(t, "delete")}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div>
      <p aria-live="polite" className="min-h-5 text-sm text-danger">
        {error}
      </p>
      {open.length === 0 ? (
        <p className="py-6 font-display text-xl font-light text-subtle">
          Nessuna attività extra aperta.
        </p>
      ) : (
        <ul className="border-t border-line">{open.map(item)}</ul>
      )}
      {closed.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer py-2 eyebrow">
            Chiuse di recente ({closed.length})
          </summary>
          <ul className="mt-2 border-t border-line">{closed.map(item)}</ul>
        </details>
      ) : null}
    </div>
  );
}
