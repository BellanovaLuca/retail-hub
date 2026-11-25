"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarX, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormMessage, Select, Switch, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { publishedDayText, resolveBackOffice, sortShifts } from "@/lib/schedule/cells";
import type { LeaveRequestInfo } from "@/lib/schedule/leave-cells";
import type {
  LeaveRecord,
  PublishedShift,
  SchedulePerson,
  ShiftRecord,
  TemplateRecord,
} from "@/lib/schedule/types";
import { isFullDayLeave, leaveLabelAdmin } from "@/lib/schedule/view";
import { clearShiftConflict, removeLeaveDays, revokeLeaveRequest, saveShiftDay } from "../actions";

type Segment = { start: string; end: string; isBackOffice: boolean };

/**
 * Dettaglio della giornata: turno rapido, fasce (spezzati), pausa, reparto, area, back office,
 * nota. Se nel giorno c'è un'assenza la si può togliere da qui (solo quel giorno, oppure tutta la
 * richiesta approvata da cui nasce); il turno si scrive comunque.
 */
export function DayDialog({
  open,
  onClose,
  weekId,
  person,
  date,
  shifts,
  leave,
  leaveRequest,
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
  /** Richiesta approvata da cui nasce l'assenza (se c'è ancora). */
  leaveRequest?: LeaveRequestInfo;
  templates: TemplateRecord[];
  departments: { id: string; name: string }[];
  published: PublishedShift[];
  /** Chiamato dopo una scrittura; con un testo, l'editor mostra una conferma. */
  onSaved: (notice?: string) => void;
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
  /** Esito di «Togli l'assenza» / «Togli tutta la richiesta»: la finestra resta aperta. */
  const [absenceResult, setAbsenceResult] = useState<{ ok: boolean; message?: string } | null>(
    null,
  );
  const [confirmRevoke, setConfirmRevoke] = useState(false);
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

  /** Toglie l'assenza (solo questo giorno, o tutta la richiesta) e lascia aperta la finestra. */
  function removeAbsence(whole: boolean) {
    setAbsenceResult(null);
    startTransition(async () => {
      const res =
        whole && leaveRequest
          ? await revokeLeaveRequest(leaveRequest.id)
          : await removeLeaveDays(weekId, [{ profileId: person.id, date }]);
      setConfirmRevoke(false);
      setAbsenceResult(res);
      // Anche se non è andata a buon fine i dati potrebbero essere cambiati: si ricaricano.
      onSaved(res.ok ? res.message : undefined);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} wide>
        {absenceResult ? (
          <div className="mb-4">
            <FormMessage result={absenceResult} />
          </div>
        ) : null}
        {leave ? (
          <section
            aria-label="Assenza della giornata"
            className="mb-4 flex flex-col gap-3 border-l-2 border-line-strong pl-3 text-sm"
          >
            <p className="text-muted">
              Assenza registrata: <span className="text-foreground">{leaveLabelAdmin(leave)}</span>
              {leave.source === "request" ? " (richiesta approvata)" : ""}.
              {isFullDayLeave(leave)
                ? " Il turno si può scrivere lo stesso: resta segnalato in conflitto finché c'è l'assenza."
                : ""}
            </p>
            {leaveRequest ? (
              <p>
                Dalla richiesta:{" "}
                <Link href={`/admin/richieste/${leaveRequest.id}`} className="link-underline nums">
                  {leaveRequest.title} · {leaveRequest.detail}
                </Link>
              </p>
            ) : null}
            {confirmRevoke && leaveRequest ? (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-md border border-danger/40 p-3"
              >
                <p>
                  Togliere tutta la richiesta ({leaveRequest.title} · {leaveRequest.detail})? Torna
                  «rifiutata» con la nota «Tolta dal foglio turni», spariscono tutte le sue assenze
                  e {person.displayName} viene avvisato.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setConfirmRevoke(false)}
                  >
                    Annulla
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => removeAbsence(true)}
                  >
                    {pending ? "Un momento…" : "Sì, togli la richiesta"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => removeAbsence(false)}
                >
                  <CalendarX aria-hidden /> Togli l&apos;assenza di questo giorno
                </Button>
                {leaveRequest?.revocable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={pending}
                    onClick={() => setConfirmRevoke(true)}
                  >
                    Togli tutta la richiesta
                  </Button>
                ) : null}
              </div>
            )}
            {leave.source === "request" ? (
              <p className="text-xs text-muted">
                Togliendo l&apos;assenza {person.displayName} riceve un avviso
                {leaveRequest ? "; gli altri giorni della richiesta restano approvati." : "."}
              </p>
            ) : null}
          </section>
        ) : null}
        {shifts.some((s) => s.conflict) ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-l-2 border-danger pl-3 text-sm text-danger">
            {leave
              ? "Questo turno è in conflitto con l'assenza: tienilo così, oppure togli l'assenza qui sopra."
              : "Questo turno è segnalato in conflitto con un'assenza."}
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const results = await Promise.all(
                    shifts.filter((s) => s.conflict).map((s) => clearShiftConflict(s.id)),
                  );
                  const ko = results.find((r) => !r.ok);
                  if (ko) {
                    setResult({ ok: false, message: ko.message });
                    return;
                  }
                  onSaved("Turno mantenuto: il conflitto è stato risolto.");
                  onClose();
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
