"use server";

import { addDays, format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  adminAction,
  dbErrorMessage,
  runAction,
  type ActionResult,
} from "@/lib/auth/guards";
import { getSchedulePeople, getTemplates } from "@/lib/data/schedule";
import { notify } from "@/lib/notifications";
import {
  createsLeaves,
  formatRange,
  requestTypeLabel,
  REVOKED_FROM_SCHEDULE_NOTE,
} from "@/lib/requests";
import { removeLeaveRows, revokeApprovedRequest } from "@/lib/leaves/removal";
import { publishSnapshot } from "@/lib/schedule/publish";
import { parseShiftCell } from "@/lib/shifts/parse";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import {
  buildDayRows,
  planCopyRows,
  restoredDayRows,
  type CopySource,
  type DayRow,
  type ExistingShift,
  type RestoreRow,
} from "./day-rows";

type Db = Awaited<ReturnType<typeof createClient>>;

const isoDate = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);

async function loadWeek(db: Db, weekId: string) {
  const { data: week } = await db.from("schedule_weeks").select("*").eq("id", weekId).single();
  if (!week) throw new ActionError("Settimana non trovata.");
  return week;
}

function revalidateWeek(weekStart: string) {
  revalidatePath(`/admin/turni/${weekStart}`);
  revalidatePath("/admin");
}

/** I 7 giorni lun→dom della settimana. */
const weekDaysOf = (weekStart: string) =>
  Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(weekStart), i), "yyyy-MM-dd"));

const dayKey = (profileId: string, date: string) => `${profileId}|${date}`;

/** Turni di lavoro tra due date, letti a pagine (PostgREST restituisce al massimo 1000 righe). */
async function loadShiftsBetween(db: Db, from: string, to: string): Promise<Tables<"shifts">[]> {
  const PAGE = 1000;
  const out: Tables<"shifts">[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shifts")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new ActionError(dbErrorMessage(error, "Turni non disponibili."));
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Sostituisce i turni delle giornate indicate in un'unica transazione (RPC `replace_shift_days`):
 * o si salvano tutte, o nessuna. Il segnale di conflitto con le assenze lo calcola il database.
 */
async function replaceDays(
  db: Db,
  weekId: string,
  days: { profile_id: string; date: string }[],
  rows: DayRow[],
) {
  if (days.length === 0) return;
  const { error } = await db.rpc("replace_shift_days", {
    p_week_id: weekId,
    p_days: days,
    p_rows: rows,
  });
  if (error) throw new ActionError(dbErrorMessage(error, "Turno non salvato."));
}

/** Riga di una giornata com'era, mandata dal foglio con Annulla/Ripeti (vedi `restoredDayRows`). */
const restoreRowSchema = z.object({
  template_id: z.uuid().nullable(),
  start_time: time.nullable(),
  end_time: time.nullable(),
  break_minutes: z.number().int().min(0).max(240),
  working_as_department_id: z.uuid().nullable(),
  zone: z.enum(["vista", "sole"]).nullable(),
  is_back_office: z.boolean().nullable(),
  note: z.string().max(200).nullable(),
});

const cellChangesSchema = z
  .array(
    z.object({
      profileId: z.uuid(),
      date: isoDate,
      value: z.string().max(60),
      restore: z.array(restoreRowSchema).max(4).optional(),
    }),
  )
  .min(1)
  .max(2000);

/**
 * Salvataggio dal foglio (digitazione, incolla, riempimento): una chiamata per operazione.
 * Con Annulla/Ripeti ogni cella porta anche la giornata com'era (`restore`): se corrisponde al
 * testo, torna identica — orari, pausa, nota, area, reparto, back office, turno rapido.
 */
export async function saveShiftCells(
  weekId: string,
  changes: { profileId: string; date: string; value: string; restore?: RestoreRow[] }[],
): Promise<ActionResult<{ errors: { profileId: string; date: string; message: string }[] }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const list = cellChangesSchema.parse(changes);
    const dayList = weekDaysOf(week.week_start);
    const days = new Set(dayList);
    // Letture una volta per lotto: turni rapidi, persone e turni della settimana. Le assenze non
    // servono: nei giorni di assenza la cella si scrive come le altre, e il segnale di conflitto
    // con un'assenza a giornata intera lo calcola il database (replace_shift_days).
    const [templates, people, existingRows] = await Promise.all([
      getTemplates(supabase),
      getSchedulePeople(supabase),
      loadShiftsBetween(supabase, dayList[0], dayList[6]),
    ]);
    const tplInput = templates.map((t) => ({
      code: t.code,
      startTime: t.startTime,
      endTime: t.endTime,
      breakMinutes: t.breakMinutes,
      isAbsence: t.isAbsence,
    }));
    const tplByCode = new Map(templates.map((t) => [t.code, t]));
    const zoneOf = new Map(people.map((p) => [p.id, p.homeZone]));
    const departmentsOf = new Map(people.map((p) => [p.id, new Set(p.departmentIds)]));
    const templateIds = new Set(templates.map((t) => t.id));
    const noDepartments = new Set<string>();
    const existingByDay = new Map<string, ExistingShift[]>();
    for (const s of existingRows) {
      const k = dayKey(s.profile_id, s.date);
      existingByDay.set(k, [...(existingByDay.get(k) ?? []), s]);
    }
    const errors: { profileId: string; date: string; message: string }[] = [];

    // A parità di cella vale l'ultima modifica del lotto.
    const writes = new Map<string, { profile_id: string; date: string; rows: DayRow[] }>();
    for (const change of list) {
      const k = dayKey(change.profileId, change.date);
      if (!days.has(change.date)) {
        errors.push({ ...change, message: "Giorno fuori dalla settimana." });
        continue;
      }
      const parsed = parseShiftCell(change.value, tplInput);
      if (parsed.kind === "error") {
        errors.push({ profileId: change.profileId, date: change.date, message: parsed.message });
        continue;
      }
      const existing = existingByDay.get(k) ?? [];
      const homeZone = zoneOf.get(change.profileId);
      // Annulla/Ripeti: la giornata com'era, se dice la stessa cosa del testo della cella.
      const restored = (expected: Parameters<typeof restoredDayRows>[2]) =>
        change.restore
          ? restoredDayRows(change.profileId, change.date, expected, change.restore, {
              templateIds,
              departmentIds: departmentsOf.get(change.profileId) ?? noDepartments,
            })
          : null;
      let rows: DayRow[];
      if (parsed.kind === "empty") {
        rows = [];
      } else if (parsed.kind === "template") {
        const tpl = tplByCode.get(parsed.code)!;
        const segments =
          tpl.isAbsence || !tpl.startTime || !tpl.endTime
            ? []
            : [{ start: tpl.startTime, end: tpl.endTime }];
        rows =
          restored({ templateId: tpl.id, segments }) ??
          buildDayRows(
            change.profileId,
            change.date,
            existing,
            segments,
            { templateId: tpl.id, breakMinutes: tpl.breakMinutes, keepDetailsIfSameTimes: true },
            homeZone,
          );
      } else {
        rows =
          restored({ templateId: null, segments: parsed.segments }) ??
          buildDayRows(
            change.profileId,
            change.date,
            existing,
            parsed.segments,
            { templateId: null, breakMinutes: 0, keepDetailsIfSameTimes: true },
            homeZone,
          );
      }
      writes.set(k, { profile_id: change.profileId, date: change.date, rows });
    }

    const batch = [...writes.values()];
    await replaceDays(
      supabase,
      week.id,
      batch.map((w) => ({ profile_id: w.profile_id, date: w.date })),
      batch.flatMap((w) => w.rows),
    );

    revalidateWeek(week.week_start);
    return {
      ok: errors.length === 0,
      message: errors.length
        ? `${errors.length} celle non valide: ${errors[0].message}`
        : "Salvato",
      data: { errors },
    } as ActionResult<{ errors: typeof errors }>;
  });
}

const daySchema = z.object({
  weekId: z.uuid(),
  profileId: z.uuid(),
  date: isoDate,
  templateId: z.uuid().nullable(),
  segments: z
    .array(z.object({ start: time, end: time, isBackOffice: z.boolean().nullable() }))
    .max(4)
    .refine((segs) => segs.every((s) => s.end > s.start), "Ogni fascia deve finire dopo l'inizio.")
    .refine(
      (segs) =>
        [...segs]
          .sort((a, b) => a.start.localeCompare(b.start))
          .every((s, i, arr) => i === 0 || s.start >= arr[i - 1].end),
      "Le fasce non devono sovrapporsi.",
    ),
  breakMinutes: z.number().int().min(0).max(240),
  departmentId: z.uuid().nullable(),
  zone: z.enum(["vista", "sole"]).nullable(),
  note: z.string().trim().max(200).nullable(),
});

/** Salvataggio dal popover della cella o dalla modalità foglio orario (fasce dipinte). */
export async function saveShiftDay(input: z.input<typeof daySchema>): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = daySchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const v = parsed.data;
    const week = await loadWeek(supabase, v.weekId);
    if (!weekDaysOf(week.week_start).includes(v.date))
      return { ok: false, message: "Giorno fuori dalla settimana." };
    const { data: existing, error: readError } = await supabase
      .from("shifts")
      .select("*")
      .eq("profile_id", v.profileId)
      .eq("date", v.date);
    if (readError) throw new ActionError(dbErrorMessage(readError, "Turno non salvato."));
    const rows = buildDayRows(
      v.profileId,
      v.date,
      existing ?? [],
      v.segments,
      {
        templateId: v.templateId,
        breakMinutes: v.breakMinutes,
        departmentId: v.departmentId,
        zone: v.zone,
        note: v.note || null,
      },
      undefined,
    );
    await replaceDays(supabase, week.id, [{ profile_id: v.profileId, date: v.date }], rows);
    revalidateWeek(week.week_start);
    return { ok: true, message: "Salvato" };
  });
}

/** Pubblica o ripubblica: istantanea, registro delle modifiche, notifiche (§5, §10). */
export async function publishWeek(
  weekId: string,
  mode: "all" | "changed",
): Promise<ActionResult<{ changes: number }>> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const res = await publishSnapshot(supabase, week.week_start, profile.id, { mode });
    if (!res.ok) return { ok: false, message: res.message };
    revalidateWeek(week.week_start);
    revalidatePath("/orari", "layout");
    revalidatePath("/");
    return {
      ok: true,
      message: res.firstPublish
        ? "Settimana pubblicata."
        : `Settimana ripubblicata (${res.changes} giornate cambiate).`,
      data: { changes: res.changes },
    };
  });
}

/**
 * Copia i turni della settimana precedente nelle giornate ancora libere. Tra le assenze si copia
 * solo il riposo (R): ferie, malattia e permessi di una settimana non valgono per quella dopo.
 */
export async function duplicatePreviousWeek(weekId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const prevStart = format(addDays(parseISO(week.week_start), -7), "yyyy-MM-dd");
    const { data: prevWeek } = await supabase
      .from("schedule_weeks")
      .select("id")
      .eq("week_start", prevStart)
      .maybeSingle();
    if (!prevWeek) return { ok: false, message: "La settimana precedente è vuota." };
    const { data: previous, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("week_id", prevWeek.id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Copia non riuscita.") };
    const source = (previous ?? []).map((s) => ({
      ...s,
      date: format(addDays(parseISO(s.date), 7), "yyyy-MM-dd"),
    }));
    return copyShifts(supabase, week, source, "rest");
  });
}

/**
 * Inserisce i turni sorgente (già con le date della settimana di destinazione) nelle giornate
 * libere: senza turni e senza assenze a giornata intera (un permesso di qualche ora non blocca).
 */
async function copyShifts(
  db: Db,
  week: { id: string; week_start: string },
  source: CopySource[],
  absences: "rest" | "all",
): Promise<ActionResult> {
  const days = weekDaysOf(week.week_start);
  const [current, leaves, active, templates, departments] = await Promise.all([
    db.from("shifts").select("profile_id, date").eq("week_id", week.id),
    db
      .from("leaves")
      .select("profile_id, date")
      .gte("date", days[0])
      .lte("date", days[6])
      .is("hours", null),
    db.from("profiles").select("id").eq("active", true),
    db.from("shift_templates").select("id, code, is_absence"),
    db.from("departments").select("id"),
  ]);
  const readError =
    current.error ?? leaves.error ?? active.error ?? templates.error ?? departments.error;
  if (readError) return { ok: false, message: dbErrorMessage(readError, "Copia non riuscita.") };

  const rows = planCopyRows(source, {
    days,
    activeIds: new Set((active.data ?? []).map((p) => p.id)),
    taken: new Set(
      [...(current.data ?? []), ...(leaves.data ?? [])].map((s) => dayKey(s.profile_id, s.date)),
    ),
    templates: new Map(
      (templates.data ?? []).map((t) => [t.id, { code: t.code, isAbsence: t.is_absence }]),
    ),
    departmentIds: new Set((departments.data ?? []).map((d) => d.id)),
    absences,
  });

  if (rows.length === 0)
    return { ok: true, message: "Nessuna giornata da copiare: sono già tutte compilate." };
  const { error } = await db.from("shifts").insert(rows.map((r) => ({ week_id: week.id, ...r })));
  if (error) return { ok: false, message: dbErrorMessage(error, "Copia non riuscita.") };
  revalidateWeek(week.week_start);
  const filled = new Set(rows.map((r) => dayKey(r.profile_id, r.date))).size;
  return { ok: true, message: `Copiate ${filled} giornate.` };
}

/**
 * Salva i turni della settimana come modello. Un nome già usato sostituisce il modello esistente
 * solo con `overwrite` (l'interfaccia chiede conferma): mai in silenzio.
 */
export async function saveWeekAsTemplate(
  weekId: string,
  name: string,
  overwrite = false,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const cleanName = z.string().trim().min(2, "Dai un nome al modello.").max(60).parse(name);
    const { data: shifts, error: readError } = await supabase
      .from("shifts")
      .select("*")
      .eq("week_id", week.id);
    // Senza i turni non si salva nulla: un modello vuoto sostituirebbe quello buono.
    if (readError) return { ok: false, message: dbErrorMessage(readError, "Modello non salvato.") };
    const { data: existing, error: existingError } = await supabase
      .from("schedule_templates")
      .select("id")
      .eq("name", cleanName)
      .maybeSingle();
    if (existingError)
      return { ok: false, message: dbErrorMessage(existingError, "Modello non salvato.") };
    if (existing && !overwrite) {
      return {
        ok: false,
        message: `Esiste già un modello "${cleanName}": conferma per sostituirlo, oppure scegli un altro nome.`,
      };
    }
    const payload = (shifts ?? []).map((s) => ({
      profile_id: s.profile_id,
      weekday: ((parseISO(s.date).getDay() + 6) % 7) + 1,
      template_id: s.template_id,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      zone: s.zone,
      is_back_office: s.is_back_office,
      working_as_department_id: s.working_as_department_id,
      note: s.note,
    }));
    const { error } = await supabase
      .from("schedule_templates")
      .upsert({ name: cleanName, shifts: payload, created_by: profile.id }, { onConflict: "name" });
    if (error) return { ok: false, message: dbErrorMessage(error, "Modello non salvato.") };
    revalidateWeek(week.week_start);
    return {
      ok: true,
      message: existing ? `Modello "${cleanName}" sostituito.` : `Modello "${cleanName}" salvato.`,
    };
  });
}

export async function applyWeekTemplate(weekId: string, templateId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const { data: tpl } = await supabase
      .from("schedule_templates")
      .select("*")
      .eq("id", z.uuid().parse(templateId))
      .single();
    if (!tpl) return { ok: false, message: "Modello non trovato." };
    // Il modello è un JSON salvato tempo fa: si legge con prudenza (giorni validi, niente
    // riferimenti a turni rapidi o reparti eliminati: li toglie planCopyRows).
    const source = (Array.isArray(tpl.shifts) ? (tpl.shifts as unknown[]) : []).flatMap((raw) => {
      const s = raw as Partial<CopySource> & { weekday?: number };
      const weekday = Number(s.weekday);
      if (!s.profile_id || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return [];
      return [
        {
          profile_id: s.profile_id,
          date: format(addDays(parseISO(week.week_start), weekday - 1), "yyyy-MM-dd"),
          template_id: s.template_id ?? null,
          start_time: s.start_time ?? null,
          end_time: s.end_time ?? null,
          break_minutes: s.break_minutes ?? 0,
          working_as_department_id: s.working_as_department_id ?? null,
          zone: s.zone ?? null,
          is_back_office: s.is_back_office ?? null,
          note: s.note ?? null,
        } satisfies CopySource,
      ];
    });
    return copyShifts(supabase, week, source, "all");
  });
}

export async function deleteWeekTemplate(templateId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("schedule_templates")
      .delete()
      .eq("id", z.uuid().parse(templateId));
    if (error) return { ok: false, message: dbErrorMessage(error, "Modello non eliminato.") };
    return { ok: true, message: "Modello eliminato." };
  });
}

export async function setWeekNote(weekId: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const { error } = await supabase
      .from("schedule_weeks")
      .update({ note: z.string().trim().max(500).parse(note) || null })
      .eq("id", week.id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Nota non salvata.") };
    revalidateWeek(week.week_start);
    // La nota non fa parte dell'istantanea: nelle settimane già pubblicate si vede subito.
    return {
      ok: true,
      message:
        week.status === "published"
          ? "Nota salvata: i dipendenti la vedono da subito negli orari."
          : "Nota salvata: sarà visibile quando pubblichi la settimana.",
    };
  });
}

export async function setWeekRuleSet(
  weekId: string,
  ruleSetId: string | null,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const { error } = await supabase
      .from("schedule_weeks")
      .update({ rule_set_id: ruleSetId ? z.uuid().parse(ruleSetId) : null })
      .eq("id", week.id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Regole non aggiornate.") };
    revalidateWeek(week.week_start);
    return { ok: true, message: "Regole della settimana aggiornate." };
  });
}

const ignoreSchema = z.object({
  weekId: z.uuid(),
  ruleId: z.uuid(),
  date: isoDate.nullable(),
  /** Persona a cui si riferisce l'avviso; null per gli avvisi di negozio (coperture). */
  profileId: z.uuid().nullable(),
  note: z.string().trim().min(2, "Scrivi una nota (es. inventario).").max(200),
});

/**
 * «Ignora per questa settimana» dal pannello degli avvisi. Un avviso che riguarda una persona
 * (ore di contratto, riposi, pausa…) si ignora solo per lei: gli avvisi della stessa regola sui
 * colleghi restano visibili. Gli avvisi di negozio si ignorano per regola e giorno, come prima.
 */
export async function ignoreWeekViolation(
  input: z.input<typeof ignoreSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const v = ignoreSchema.safeParse(input);
    if (!v.success) return { ok: false, message: v.error.issues[0].message };
    const { error } = await supabase.from("rule_overrides").insert({
      week_id: v.data.weekId,
      rule_id: v.data.ruleId,
      date: v.data.date,
      profile_id: v.data.profileId,
      note: v.data.note,
      created_by: profile.id,
    });
    if (error) {
      return {
        ok: false,
        message:
          error.code === "23505"
            ? "Questo avviso è già tra quelli ignorati."
            : dbErrorMessage(error, "Avviso non ignorato."),
      };
    }
    revalidatePath("/admin/turni", "layout");
    revalidatePath("/admin");
    return { ok: true, message: "Avviso ignorato per questa settimana." };
  });
}

/** Segna come risolto il conflitto con un'assenza approvata (il turno resta). */
export async function clearShiftConflict(shiftId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { data, error } = await supabase
      .from("shifts")
      .update({ conflict: false })
      .eq("id", z.uuid().parse(shiftId))
      .select("date")
      .single();
    if (error) return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita.") };
    revalidatePath("/admin/turni", "layout");
    return { ok: true, message: data ? "Conflitto risolto." : undefined };
  });
}

/** Dopo aver tolto assenze o richieste dal foglio: turni, ferie, richieste e orari cambiano. */
function revalidateAbsences() {
  revalidatePath("/admin/turni", "layout");
  revalidatePath("/admin/ferie", "layout");
  revalidatePath("/admin/richieste", "layout");
  revalidatePath("/admin");
  revalidatePath("/richieste", "layout");
  revalidatePath("/ferie");
  revalidatePath("/orari", "layout");
  revalidatePath("/");
}

const leaveDaysSchema = z
  .array(z.object({ profileId: z.uuid(), date: isoDate }))
  .min(1)
  .max(200);

/**
 * «Togli l'assenza di questo giorno» dal foglio turni (anche per più celle selezionate): elimina
 * le righe di `leaves` di quelle giornate e azzera il segnale di conflitto dei turni (RPC
 * `remove_leave_days`, un'unica transazione). Se l'assenza veniva da una richiesta approvata il
 * dipendente viene avvisato; una richiesta rimasta senza nessun giorno torna "rifiutata".
 */
export async function removeLeaveDays(
  weekId: string,
  days: { profileId: string; date: string }[],
): Promise<ActionResult<{ removed: number; revokedRequests: number }>> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const parsed = leaveDaysSchema.safeParse(days);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const dayList = weekDaysOf(week.week_start);
    if (parsed.data.some((d) => !dayList.includes(d.date)))
      return { ok: false, message: "Giorno fuori dalla settimana." };

    // Cosa c'è davvero in quelle giornate: serve per avvisare chi aveva una richiesta approvata.
    const wanted = new Set(parsed.data.map((d) => dayKey(d.profileId, d.date)));
    const { data: leaveRows, error: readError } = await supabase
      .from("leaves")
      .select("profile_id, date, type, hours, status, source, request_id")
      .gte("date", dayList[0])
      .lte("date", dayList[6])
      .in("profile_id", [...new Set(parsed.data.map((d) => d.profileId))]);
    if (readError) throw new ActionError(dbErrorMessage(readError, "Assenze non disponibili."));
    const targets = (leaveRows ?? []).filter((l) => wanted.has(dayKey(l.profile_id, l.date)));
    if (targets.length === 0) {
      revalidateAbsences();
      return {
        ok: true,
        message: "In quelle giornate non c'è nessuna assenza da togliere.",
        data: { removed: 0, revokedRequests: 0 },
      };
    }

    const { removed, revokedRequests, notices } = await removeLeaveRows(
      supabase,
      profile.id,
      targets,
      { note: REVOKED_FROM_SCHEDULE_NOTE, title: "Assenza tolta dal foglio turni" },
    );

    revalidateAbsences();
    const parts = [removed === 1 ? "Assenza tolta." : `Tolte ${removed} assenze.`];
    if (revokedRequests === 1)
      parts.push("La richiesta non aveva altri giorni: ora risulta rifiutata.");
    else if (revokedRequests > 1)
      parts.push(`${revokedRequests} richieste non avevano altri giorni: ora risultano rifiutate.`);
    if (notices) parts.push(notices === 1 ? "Dipendente avvisato." : "Dipendenti avvisati.");
    return {
      ok: true,
      message: parts.join(" "),
      data: { removed, revokedRequests },
    };
  });
}

/**
 * «Togli tutta la richiesta» dal foglio turni: revoca l'approvazione di una richiesta di assenza
 * (ferie, permesso, malattia, giorno libero, indisponibilità). Spariscono tutte le sue assenze e
 * i conflitti dei turni; il dipendente viene avvisato. Non vale per gli scambi di turno: uno
 * scambio approvato ha già spostato i turni e non si annulla da qui.
 */
export async function revokeLeaveRequest(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const id = z.uuid().safeParse(requestId);
    if (!id.success) return { ok: false, message: "Dati non validi." };
    const { data: r, error } = await supabase
      .from("requests")
      .select("id, type, status")
      .eq("id", id.data)
      .maybeSingle();
    if (error) throw new ActionError(dbErrorMessage(error, "Richiesta non disponibile."));
    if (!r) return { ok: false, message: "Richiesta non trovata." };
    if (!createsLeaves(r.type))
      return { ok: false, message: "Questo tipo di richiesta non si toglie dal foglio turni." };
    const revoked =
      r.status === "approved"
        ? await revokeApprovedRequest(supabase, profile.id, r.id, REVOKED_FROM_SCHEDULE_NOTE)
        : null;
    if (!revoked) {
      revalidateAbsences();
      return { ok: false, message: "La richiesta non è più approvata: ricarica la pagina." };
    }

    const what = `${requestTypeLabel(revoked.type)} · ${formatRange(revoked.start_date, revoked.end_date)}`;
    await notify([revoked.profile_id], {
      kind: "request_decided",
      title: "Approvazione revocata",
      body: `${what}\n${REVOKED_FROM_SCHEDULE_NOTE}`,
      link: `/richieste/${revoked.id}`,
    });
    revalidateAbsences();
    return {
      ok: true,
      message: `Richiesta tolta (${what}): le sue assenze sono state eliminate e il dipendente è stato avvisato.`,
    };
  });
}
