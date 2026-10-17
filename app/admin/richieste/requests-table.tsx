"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge, requestSummary } from "@/components/requests/request-parts";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { RequestStatus } from "@/lib/requests";
import { decideRequests } from "./actions";

export type AdminRequestRow = {
  id: string;
  person: string;
  target: string | null;
  type: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  hours: number | null;
  recurring: number[] | null;
  status: RequestStatus;
  message: string | null;
  createdAt: string;
  decidable: boolean;
};

export function RequestsTable({
  rows,
  selectable,
}: {
  rows: AdminRequestRow[];
  selectable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const decidable = rows.filter((r) => r.decidable);

  function decide(ids: string[], decision: "approved" | "rejected") {
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await decideRequests(ids, decision, note);
      setResult(res);
      if (res.ok) {
        setSelected(new Set());
        setNote("");
      }
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="py-16 font-display text-2xl font-light text-subtle">Nessuna richiesta.</p>;
  }

  return (
    <div>
      {selectable && decidable.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3 rounded-md bg-surface p-3 sm:flex-row sm:items-center">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={selected.size > 0 && selected.size === decidable.length}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(decidable.map((r) => r.id)) : new Set())
              }
            />
            {selected.size ? `${selected.size} selezionate` : "Seleziona tutte"}
          </label>
          <Input
            aria-label="Nota di decisione"
            placeholder="Nota di decisione (facoltativa)"
            className="flex-1 bg-background"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={pending || selected.size === 0}
              onClick={() => decide([...selected], "rejected")}
            >
              <X aria-hidden /> Rifiuta
            </Button>
            <Button
              size="sm"
              disabled={pending || selected.size === 0}
              onClick={() => decide([...selected], "approved")}
            >
              <Check aria-hidden /> Approva
            </Button>
          </span>
        </div>
      ) : null}
      <div className="mb-3">
        <FormMessage result={result} />
      </div>
      <ul className="border-t border-line">
        {rows.map((r) => {
          const s = requestSummary({
            type: r.type,
            start_date: r.startDate,
            end_date: r.endDate,
            start_time: r.startTime,
            end_time: r.endTime,
            hours: r.hours,
            recurring_weekdays: r.recurring,
          });
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3">
              {selectable ? (
                <input
                  type="checkbox"
                  aria-label={`Seleziona la richiesta di ${r.person}`}
                  className="size-4 accent-foreground"
                  disabled={!r.decidable}
                  checked={selected.has(r.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(r.id);
                    else next.delete(r.id);
                    setSelected(next);
                  }}
                />
              ) : null}
              <Link href={`/admin/richieste/${r.id}`} className="min-w-0 flex-1">
                <span className="block font-medium">
                  {r.person} · {s.title}
                  {r.target ? ` con ${r.target}` : ""}
                </span>
                <span className="block text-sm text-muted nums">
                  {s.detail}
                  <span className="text-subtle">
                    {" "}
                    · inviata {format(parseISO(r.createdAt), "d MMM", { locale: it })}
                  </span>
                </span>
                {r.message ? <span className="block truncate text-sm">{r.message}</span> : null}
              </Link>
              <StatusBadge status={r.status} />
              {r.decidable ? (
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rifiuta la richiesta di ${r.person}`}
                    disabled={pending}
                    onClick={() => decide([r.id], "rejected")}
                  >
                    <X />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Approva la richiesta di ${r.person}`}
                    disabled={pending}
                    onClick={() => decide([r.id], "approved")}
                  >
                    <Check />
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
