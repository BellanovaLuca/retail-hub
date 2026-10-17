"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, Switch } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { addNationalHolidays, deleteHoliday, saveHoliday } from "../actions";

type Holiday = { id: string; date: string; label: string; storeClosed: boolean };

export function HolidaysEditor({ year, holidays }: { year: number; holidays: Holiday[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState({ date: "", label: "", storeClosed: false });
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      setResult(await fn());
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle className="mb-0">Festività {year}</CardTitle>
          <span className="flex gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Anno precedente">
              <Link href={`?anno=${year - 1}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Anno successivo">
              <Link href={`?anno=${year + 1}`}>
                <ChevronRight />
              </Link>
            </Button>
          </span>
        </div>
        {holidays.length === 0 ? (
          <div className="py-8">
            <p className="mb-4 font-display text-xl font-light text-subtle">
              Nessuna festività per il {year}.
            </p>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => addNationalHolidays(year))}
            >
              Aggiungi le festività nazionali {year}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2">
                <span className="w-28 shrink-0 text-sm capitalize nums">
                  {format(parseISO(h.date), "EEE d MMM", { locale: it })}
                </span>
                <span className="flex-1 text-sm">{h.label}</span>
                <span className="w-44">
                  <Switch
                    checked={h.storeClosed}
                    onCheckedChange={(v) => run(() => saveHoliday({ ...h, storeClosed: v }))}
                    label="Negozio chiuso"
                    disabled={pending}
                  />
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Elimina ${h.label}`}
                  disabled={pending}
                  onClick={() => run(() => deleteHoliday(h.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <FormMessage result={result} />
        </div>
      </Card>

      <Card>
        <CardTitle>Aggiungi una festività o chiusura</CardTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveHoliday(draft);
              setResult(res);
              if (res.ok) {
                setDraft({ date: "", label: "", storeClosed: false });
                router.refresh();
              }
            });
          }}
        >
          <Field label="Data" htmlFor="hol-date">
            <Input
              id="hol-date"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </Field>
          <Field label="Nome" htmlFor="hol-label">
            <Input
              id="hol-label"
              placeholder="Es. Chiusura per inventario"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </Field>
          <Switch
            checked={draft.storeClosed}
            onCheckedChange={(v) => setDraft({ ...draft, storeClosed: v })}
            label="Negozio chiuso"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={pending || !draft.date || !draft.label}
            >
              Aggiungi
            </Button>
          </div>
        </form>
        <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
          Per orari diversi in un singolo giorno usa le eccezioni in &laquo;Orari di
          apertura&raquo;.
        </p>
      </Card>
    </div>
  );
}
