"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormMessage, Select, Switch, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { publishedDayText, resolveBackOffice, sortShifts } from "@/lib/schedule/cells";
import type {
  LeaveRecord,
  PublishedShift,
  SchedulePerson,
  ShiftRecord,
  TemplateRecord,
} from "@/lib/schedule/types";
import { leaveLabelAdmin } from "@/lib/schedule/view";
import { clearShiftConflict, saveShiftDay } from "../actions";

type Segment = { start: string; end: string; isBackOffice: boolean };

/** Dettaglio della giornata: turno rapido, fasce (spezzati), pausa, reparto, area, back office, nota. */
export function DayDialog({
  open,
  onClose,
  weekId,
  person,
  date,
  shifts,
  leave,
  templates,
  departments,
  published,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  weekId: string;
  person: SchedulePerson;
  date: string;
  shifts: ShiftRecord[];
  leave?: LeaveRecord;
  templates: TemplateRecord[];
  departments: { id: string; name: string }[];
  published: PublishedShift[];
  onSaved: () => void;
}) {
  const sorted = sortShifts(shifts);
  const first = sorted[0];
  const [templateId, setTemplateId] = useState<string>(
    sorted.length === 1 ? (first?.templateId ?? "") : "",
  );
  const [segments, setSegments] = useState<Segment[]>(
    sorted
      .filter((s) => s.start && s.end)
      .map((s) => ({ start: s.start!, end: s.end!, isBackOffice: resolveBackOffice(s, person) })),
  );
  const [breakMinutes, setBreakMinutes] = useState(first?.breakMinutes ?? 0);
  const [departmentId, setDepartmentId] = useState(
    first?.departmentId ?? person.primaryDepartmentId ?? "",
  );
  const [zone, setZone] = useState<"" | "vista" | "sole">(
    first?.zone ?? (person.homeZone === "jolly" ? "" : person.homeZone),
  );
  const [note, setNote] = useState(first?.note ?? "");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const tpl = templates.find((t) => t.id === templateId);
  const myDepartments = departments.filter((d) => person.departmentIds.includes(d.id));
  const title = `${person.displayName} · ${format(parseISO(date), "EEEE d MMMM", { locale: it })}`;
  const publishedText = publishedDayText(published, true);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (t.isAbsence) {
      setSegments([]);
      setBreakMinutes(0);
    } else if (t.startTime && t.endTime) {
      setSegments([
        { start: t.startTime, end: t.endTime, isBackOffice: !person.countsForCoverage },
      ]);
      setBreakMinutes(t.breakMinutes);
    }
  }

  function save(clear = false) {
    setResult(null);
    startTransition(async () => {
      const res = await saveShiftDay({
        weekId,
        profileId: person.id,
        date,
        templateId: clear ? null : templateId || null,
        segments: clear ? [] : segments,
        breakMinutes,
        departmentId: departmentId || null,
        zone: zone || null,
        note: note || null,
      });
      if (!res.ok) {
        setResult({ ok: false, message: res.message });
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} wide>
        {leave ? (
          <p className="mb-4 border-l-2 border-line-strong pl-3 text-sm text-muted">
            Assenza registrata: {leaveLabelAdmin(leave)}
            {leave.source === "request" ? " (richiesta approvata)" : ""}.
          </p>
        ) : null}
        {shifts.some((s) => s.conflict) ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-l-2 border-danger pl-3 text-sm text-danger">
            Questo turno è in conflitto con un&apos;assenza approvata.
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await Promise.all(
                    shifts.filter((s) => s.conflict).map((s) => clearShiftConflict(s.id)),
                  );
                  onSaved();
                })
              }
            >
              Mantieni il turno
            </Button>
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Field label="Turno rapido" htmlFor="dd-template">
              <Select
                id="dd-template"
                value={templateId}
                onChange={(e) => chooseTemplate(e.target.value)}
              >
                <option value="">Orario libero</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.label}
                    {t.startTime ? ` (${t.startTime}–${t.endTime})` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            {!tpl?.isAbsence ? (
              <fieldset>
                <legend className="mb-2 eyebrow">Fasce orarie</legend>
                <ul className="flex flex-col gap-3">
                  {segments.map((seg, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        step={900}
                        aria-label={`Fascia ${i + 1}: inizio`}
                        className="w-28 nums"
                        value={seg.start}
                        onChange={(e) => {
                          setTemplateId("");
                          setSegments(
                            segments.map((s, j) => (j === i ? { ...s, start: e.target.value } : s)),
                          );
                        }}
                      />
                      <span className="text-muted">–</span>
                      <Input
                        type="time"
                        step={900}
                        aria-label={`Fascia ${i + 1}: fine`}
                        className="w-28 nums"
                        value={seg.end}
                        onChange={(e) => {
                          setTemplateId("");
                          setSegments(
                            segments.map((s, j) => (j === i ? { ...s, end: e.target.value } : s)),
                          );
                        }}
                      />
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          className="size-4 accent-foreground"
                          checked={seg.isBackOffice}
                          onChange={(e) =>
                            setSegments(
                              segments.map((s, j) =>
                                j === i ? { ...s, isBackOffice: e.target.checked } : s,
                              ),
                            )
                          }
                        />
                        Back office
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Elimina fascia ${i + 1}`}
                        onClick={() => setSegments(segments.filter((_, j) => j !== i))}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
                {segments.length < 4 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setTemplateId("");
                      const last = segments[segments.length - 1];
                      setSegments([
                        ...segments,
                        last
                          ? {
                              start: last.end,
                              end: last.end < "20:00" ? "20:00" : last.end,
                              isBackOffice: false,
                            }
                          : {
                              start: "10:00",
                              end: "18:00",
                              isBackOffice: !person.countsForCoverage,
                            },
                      ]);
                    }}
                  >
                    <Plus aria-hidden /> Aggiungi fascia
                  </Button>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  Un turno spezzato è fatto di più fasce. Per chi apre in back office: 08:30–10:00
                  in back office, poi 10:00–17:30 in vendita.
                </p>
              </fieldset>
            ) : null}
          </div>

          <div className="flex flex-col gap-5">
            {!tpl?.isAbsence ? (
              <Field
                label="Pausa (minuti)"
                htmlFor="dd-break"
                hint="I vuoti tra le fasce contano già come pausa."
              >
                <Input
                  id="dd-break"
                  type="number"
                  min={0}
                  step={15}
                  className="w-28 nums"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number(e.target.value))}
                />
              </Field>
            ) : null}
            {myDepartments.length > 1 ? (
              <Field label="Lavora come" htmlFor="dd-dept">
                <Select
                  id="dd-dept"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  {myDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <fieldset>
              <legend className="mb-2 eyebrow">Area</legend>
              <div role="radiogroup" className="grid grid-cols-2 border border-foreground">
                {(["vista", "sole"] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    role="radio"
                    aria-checked={zone === z}
                    onClick={() => setZone(z)}
                    className={
                      zone === z
                        ? "min-h-11 bg-foreground text-sm text-background"
                        : "min-h-11 text-sm hover:bg-surface"
                    }
                  >
                    {z === "vista" ? "Vista" : "Sole"}
                  </button>
                ))}
              </div>
              {person.homeZone === "jolly" && !zone ? (
                <p className="mt-2 text-xs text-warning">
                  Jolly: scegli l&apos;area di questo turno.
                </p>
              ) : null}
            </fieldset>
            <Field label="Nota" htmlFor="dd-note">
              <Textarea
                id="dd-note"
                className="min-h-16"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {publishedText ? (
              <p className="text-xs text-muted">
                Pubblicato: <span className="nums">{publishedText}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => save(true)}
            disabled={pending || shifts.length === 0}
          >
            Svuota la giornata
          </Button>
          <div className="flex items-center gap-3">
            <FormMessage result={result} />
            <Button
              onClick={() => save()}
              disabled={pending || (!tpl?.isAbsence && segments.length === 0)}
            >
              {pending ? "Salvataggio…" : "Salva"}
            </Button>
          </div>
        </div>
        <span className="sr-only">
          <Switch checked={false} onCheckedChange={() => undefined} label="" />
        </span>
      </DialogContent>
    </Dialog>
  );
}
