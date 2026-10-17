"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { WEEKDAY_LABELS, type OpeningHoursMap } from "@/lib/settings";
import { deleteOpeningException, saveOpeningHours, upsertOpeningException } from "../actions";

type Result = { ok: boolean; message?: string } | null;

export function OpeningHoursForm({ initial }: { initial: OpeningHoursMap }) {
  const [hours, setHours] = useState(initial);
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  function setDay(day: string, value: OpeningHoursMap[string]) {
    setHours({ ...hours, [day]: value });
  }

  return (
    <Card>
      <CardTitle>Orario settimanale</CardTitle>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => setResult(await saveOpeningHours(hours)));
        }}
      >
        <ul className="divide-y divide-line border-y border-line">
          {WEEKDAY_LABELS.map((label, i) => {
            const day = String(i + 1);
            const value = hours[day];
            return (
              <li
                key={day}
                className="grid grid-cols-[6.5rem_1fr] items-center gap-3 py-3 sm:grid-cols-[8rem_1fr_auto]"
              >
                <span className="text-sm font-medium">{label}</span>
                {value ? (
                  <span className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${label}: apertura`}
                      className="w-28 nums"
                      value={value.open}
                      onChange={(e) => setDay(day, { ...value, open: e.target.value })}
                    />
                    <span className="text-muted">–</span>
                    <Input
                      type="time"
                      aria-label={`${label}: chiusura`}
                      className="w-28 nums"
                      value={value.close}
                      onChange={(e) => setDay(day, { ...value, close: e.target.value })}
                    />
                  </span>
                ) : (
                  <span className="text-sm text-subtle">Chiuso</span>
                )}
                <Checkbox
                  className="col-span-2 sm:col-span-1"
                  label="Chiuso"
                  checked={!value}
                  onChange={(e) =>
                    setDay(day, e.target.checked ? null : { open: "10:00", close: "20:00" })
                  }
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex items-center justify-end gap-4">
          <FormMessage result={result} />
          <Button type="submit" disabled={pending}>
            {pending ? "Salvataggio…" : "Salva orari"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

type Exception = {
  id: string;
  date: string;
  openTime: string | null;
  closeTime: string | null;
  note: string | null;
};

export function ExceptionsEditor({ exceptions }: { exceptions: Exception[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    date: "",
    closed: false,
    openTime: "10:00",
    closeTime: "20:00",
    note: "",
  });
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardTitle>Eccezioni per singoli giorni</CardTitle>
      {exceptions.length === 0 ? (
        <p className="mb-6 text-sm text-muted">Nessuna eccezione in programma.</p>
      ) : (
        <ul className="mb-6 divide-y divide-line border-y border-line">
          {exceptions.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>
                <span className="font-medium capitalize">
                  {format(parseISO(e.date), "EEE d MMM yyyy", { locale: it })}
                </span>
                <span className="ml-2 text-muted nums">
                  {e.openTime ? `${e.openTime}–${e.closeTime}` : "Chiuso"}
                </span>
                {e.note ? <span className="block text-xs text-muted">{e.note}</span> : null}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Elimina eccezione"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setResult(await deleteOpeningException(e.id));
                    router.refresh();
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          startTransition(async () => {
            const res = await upsertOpeningException({
              date: draft.date,
              closed: draft.closed,
              openTime: draft.closed ? null : draft.openTime,
              closeTime: draft.closed ? null : draft.closeTime,
              note: draft.note || null,
            });
            setResult(res);
            if (res.ok) {
              setDraft({ ...draft, date: "", note: "" });
              router.refresh();
            }
          });
        }}
      >
        <Field label="Giorno" htmlFor="exc-date">
          <Input
            id="exc-date"
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>
        <Checkbox
          label="Negozio chiuso"
          checked={draft.closed}
          onChange={(e) => setDraft({ ...draft, closed: e.target.checked })}
        />
        {!draft.closed ? (
          <div className="flex items-center gap-2">
            <Input
              type="time"
              aria-label="Apertura"
              className="w-28 nums"
              value={draft.openTime}
              onChange={(e) => setDraft({ ...draft, openTime: e.target.value })}
            />
            <span className="text-muted">–</span>
            <Input
              type="time"
              aria-label="Chiusura"
              className="w-28 nums"
              value={draft.closeTime}
              onChange={(e) => setDraft({ ...draft, closeTime: e.target.value })}
            />
          </div>
        ) : null}
        <Field label="Nota" htmlFor="exc-note">
          <Input
            id="exc-note"
            placeholder="Es. inventario, apertura straordinaria"
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </Field>
        <div className="flex items-center justify-end gap-4">
          <FormMessage result={result} />
          <Button type="submit" variant="secondary" disabled={pending || !draft.date}>
            Aggiungi eccezione
          </Button>
        </div>
      </form>
    </Card>
  );
}
