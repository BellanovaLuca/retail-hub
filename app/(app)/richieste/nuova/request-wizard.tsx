"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Select, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { REQUEST_TYPES, WEEKDAY_NAMES, formatRange, type RequestType } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { checkRequest, createRequest, uploadRequestAttachment } from "../actions";

export type ShiftOption = { id: string; profileId: string; date: string; text: string };

const dayLabel = (d: string) => format(parseISO(d), "EEE d MMM", { locale: it });

/** Procedura guidata (§6.1): tipo → date/orari → collega (solo scambio) → messaggio e allegato. */
export function RequestWizard({
  me,
  today,
  initial,
  myShifts,
  colleagueShifts,
  colleagues,
}: {
  me: string;
  today: string;
  initial: { type?: RequestType; startDate?: string; endDate?: string; shiftId?: string };
  myShifts: ShiftOption[];
  colleagueShifts: ShiftOption[];
  colleagues: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(initial.type ? 1 : 0);
  const [type, setType] = useState<RequestType>(initial.type ?? "ferie");
  const initialShift = myShifts.find((s) => s.id === initial.shiftId);
  const [startDate, setStartDate] = useState(initial.startDate ?? initialShift?.date ?? "");
  const [endDate, setEndDate] = useState(initial.endDate ?? initialShift?.date ?? "");
  const [partial, setPartial] = useState(false);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("14:00");
  const [hours, setHours] = useState("4");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [shiftId, setShiftId] = useState(initial.shiftId ?? "");
  const [targetProfileId, setTargetProfileId] = useState("");
  const [targetShiftId, setTargetShiftId] = useState("");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<{ path: string; name: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const isSwap = type === "scambio_turno";
  const isShiftBased = type === "cambio_turno" || isSwap;
  const singleDay = type === "giorno_libero" || isShiftBased;
  const steps = isSwap
    ? ["Tipo", "Turno", "Collega", "Messaggio"]
    : ["Tipo", "Quando", "Messaggio"];
  const lastStep = steps.length - 1;

  // Per cambio e scambio la data è quella del turno scelto.
  useEffect(() => {
    if (!isShiftBased) return;
    const s = myShifts.find((x) => x.id === shiftId);
    if (s) {
      setStartDate(s.date);
      setEndDate(s.date);
    }
  }, [isShiftBased, shiftId, myShifts]);

  useEffect(() => {
    if (singleDay && startDate) setEndDate(startDate);
  }, [singleDay, startDate]);

  useEffect(() => {
    if (!startDate || !endDate) return;
    const t = setTimeout(async () => {
      const res = await checkRequest({ type, startDate, endDate });
      setWarnings(res.ok && res.data ? res.data : []);
    }, 300);
    return () => clearTimeout(t);
  }, [type, startDate, endDate]);

  const targetOptions = useMemo(
    () =>
      colleagueShifts.filter(
        (s) => s.profileId === targetProfileId && (!startDate || s.date >= today),
      ),
    [colleagueShifts, targetProfileId, startDate, today],
  );

  function canAdvance() {
    if (step === 0) return true;
    if (step === 1) {
      if (isShiftBased) return Boolean(shiftId);
      if (!startDate || !endDate || endDate < startDate) return false;
      if (type === "indisponibilita") return weekdays.length > 0;
      return true;
    }
    if (isSwap && step === 2) return Boolean(targetProfileId);
    return true;
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await createRequest({
        type,
        startDate,
        endDate,
        startTime:
          (type === "permesso" && partial) || type === "indisponibilita"
            ? partial
              ? startTime
              : null
            : null,
        endTime:
          (type === "permesso" && partial) || type === "indisponibilita"
            ? partial
              ? endTime
              : null
            : null,
        hours: type === "permesso" && partial ? Number(hours.replace(",", ".")) : null,
        recurringWeekdays: type === "indisponibilita" ? weekdays : null,
        shiftId: isShiftBased ? shiftId || null : null,
        targetProfileId: isSwap ? targetProfileId || null : null,
        targetShiftId: isSwap ? targetShiftId || null : null,
        targetDate: isSwap
          ? (colleagueShifts.find((s) => s.id === targetShiftId)?.date ?? null)
          : null,
        message,
        attachmentPath: attachment?.path ?? null,
      });
      if (!res.ok || !res.data) {
        setResult({ ok: false, message: res.message });
        return;
      }
      router.push(`/richieste/${res.data.id}`);
    });
  }

  return (
    <div className="max-w-2xl">
      <ol className="mb-8 flex gap-2" aria-label="Passaggi">
        {steps.map((label, i) => (
          <li key={label} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <span className={cn("block h-0.5", i <= step ? "bg-foreground" : "bg-line")} />
            <span className={cn("mt-2 block eyebrow", i === step ? "text-foreground" : "")}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <fieldset>
          <legend className="sr-only">Tipo di richiesta</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {REQUEST_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setType(t.value);
                  setStep(1);
                }}
                className={cn(
                  "flex min-h-20 flex-col items-start justify-center rounded-md border px-4 py-3 text-left transition-colors",
                  type === t.value ? "border-foreground" : "border-line hover:border-foreground",
                )}
              >
                <span className="font-medium">{t.label}</span>
                <span className="text-sm text-muted">{t.description}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-5">
          {isShiftBased ? (
            <Field
              label="Il tuo turno"
              htmlFor="rq-shift"
              hint={
                myShifts.length === 0
                  ? "Non hai turni pubblicati nelle prossime settimane."
                  : undefined
              }
            >
              <Select id="rq-shift" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                <option value="">Scegli un turno</option>
                {myShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {dayLabel(s.date)} · {s.text}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className={cn("grid gap-4", singleDay ? "" : "sm:grid-cols-2")}>
              <Field label={singleDay ? "Giorno" : "Dal"} htmlFor="rq-start">
                <Input
                  id="rq-start"
                  type="date"
                  min={type === "malattia" ? undefined : today}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              {!singleDay ? (
                <Field label="Al" htmlFor="rq-end">
                  <Input
                    id="rq-end"
                    type="date"
                    min={startDate || today}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          )}

          {type === "permesso" || type === "indisponibilita" ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={partial}
                onChange={(e) => setPartial(e.target.checked)}
              />
              {type === "permesso" ? "Solo alcune ore" : "Solo in una fascia oraria"}
            </label>
          ) : null}
          {partial && (type === "permesso" || type === "indisponibilita") ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Dalle" htmlFor="rq-from">
                <Input
                  id="rq-from"
                  type="time"
                  className="w-28 nums"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
              <Field label="Alle" htmlFor="rq-to">
                <Input
                  id="rq-to"
                  type="time"
                  className="w-28 nums"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </Field>
              {type === "permesso" ? (
                <Field label="Ore" htmlFor="rq-hours">
                  <Input
                    id="rq-hours"
                    inputMode="decimal"
                    className="w-20 nums"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {type === "indisponibilita" ? (
            <fieldset>
              <legend className="mb-2 eyebrow">Giorni della settimana</legend>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_NAMES.map((n, i) => {
                  const d = i + 1;
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort())
                      }
                      className={cn(
                        "min-h-11 min-w-12 border text-sm capitalize",
                        on ? "border-foreground bg-foreground text-background" : "border-line",
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {type === "malattia" ? (
            <p className="text-sm text-muted">
              Indica solo le date: non scrivere mai la diagnosi. Eventuali certificati li vedono
              solo i responsabili.
            </p>
          ) : null}
        </div>
      ) : null}

      {isSwap && step === 2 ? (
        <div className="flex flex-col gap-5">
          <Field label="Collega" htmlFor="rq-target">
            <Select
              id="rq-target"
              value={targetProfileId}
              onChange={(e) => {
                setTargetProfileId(e.target.value);
                setTargetShiftId("");
              }}
            >
              <option value="">Scegli il collega</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {targetProfileId ? (
            <Field
              label="Il suo turno da prendere in cambio"
              htmlFor="rq-target-shift"
              hint="Facoltativo: lascia vuoto se il collega prende solo il tuo turno."
            >
              <Select
                id="rq-target-shift"
                value={targetShiftId}
                onChange={(e) => setTargetShiftId(e.target.value)}
              >
                <option value="">Nessuno: prende solo il mio turno</option>
                {targetOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {dayLabel(s.date)} · {s.text}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      ) : null}

      {step === lastStep ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted">
            {REQUEST_TYPES.find((t) => t.value === type)?.label}
            {startDate && endDate ? ` · ${formatRange(startDate, endDate)}` : ""}
          </p>
          <Field
            label="Messaggio"
            htmlFor="rq-msg"
            hint={type === "cambio_turno" ? "Scrivi che orario ti servirebbe." : undefined}
          >
            <Textarea
              id="rq-msg"
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <Paperclip className="size-4 stroke-[1.5]" aria-hidden />
              <span className="link-underline">
                {attachment ? attachment.name : "Aggiungi un allegato (facoltativo)"}
              </span>
              <input
                type="file"
                className="sr-only"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.set("file", file);
                  startTransition(async () => {
                    const res = await uploadRequestAttachment(fd);
                    if (res.ok && res.data) setAttachment(res.data);
                    else setResult({ ok: false, message: res.message });
                  });
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {warnings.length > 0 && step > 0 ? (
        <ul className="mt-6 flex flex-col gap-1 border-l-2 border-warning pl-3 text-sm text-warning">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 stroke-[1.5]" aria-hidden /> {w}
            </li>
          ))}
          <li className="text-xs text-muted">Sono solo avvisi: puoi inviare comunque.</li>
        </ul>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={pending}>
            Indietro
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <FormMessage result={result} />
          {step < lastStep ? (
            step > 0 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canAdvance()}>
                Avanti
              </Button>
            ) : null
          ) : (
            <Button onClick={submit} disabled={pending || !canAdvance()}>
              {pending ? "Invio…" : "Invia richiesta"}
            </Button>
          )}
        </div>
      </div>
      <input type="hidden" value={me} readOnly />
    </div>
  );
}
