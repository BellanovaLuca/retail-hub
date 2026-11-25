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
import { publishSnapshot } from "@/lib/schedule/publish";
import { parseShiftCell } from "@/lib/shifts/parse";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import {
  buildDayRows,
  planCopyRows,
  type CopySource,
  type DayRow,
  type ExistingShift,
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

const cellChangesSchema = z
  .array(z.object({ profileId: z.uuid(), date: isoDate, value: z.string().max(60) }))
  .min(1)
  .max(2000);

/** Salvataggio dal foglio (digitazione, incolla, riempimento): una chiamata per operazione. */
export async function saveShiftCells(
  weekId: string,
  changes: { profileId: string; date: string; value: string }[],
): Promise<ActionResult<{ errors: { profileId: string; date: string; message: string }[] }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const list = cellChangesSchema.parse(changes);
    const dayList = weekDaysOf(week.week_start);
    const days = new Set(dayList);
    // Letture una volta per lotto: turni rapidi, persone, turni e assenze della settimana.
    const [templates, people, existingRows, { data: leaveRows, error: leavesError }] =
      await Promise.all([
        getTemplates(supabase),
        getSchedulePeople(supabase),
        loadShiftsBetween(supabase, dayList[0], dayList[6]),
        supabase
          .from("leaves")
          .select("profile_id, date, hours")
          .gte("date", dayList[0])
          .lte("date", dayList[6]),
      ]);
    if (leavesError) throw new ActionError(dbErrorMessage(leavesError, "Assenze non disponibili."));
    const tplInput = templates.map((t) => ({
      code: t.code,
      startTime: t.startTime,
      endTime: t.endTime,
      breakMinutes: t.breakMinutes,
      isAbsence: t.isAbsence,
    }));
    const tplByCode = new Map(templates.map((t) => [t.code, t]));
    const zoneOf = new Map(people.map((p) => [p.id, p.homeZone]));
    const existingByDay = new Map<string, ExistingShift[]>();
    for (const s of existingRows) {
      const k = dayKey(s.profile_id, s.date);
      existingByDay.set(k, [...(existingByDay.get(k) ?? []), s]);
    }
    const errors: { profileId: string; date: string; message: string }[] = [];
    const absentDays = new Set(
      (leaveRows ?? []).filter((l) => !l.hours).map((l) => dayKey(l.profile_id, l.date)),
    );

    // A parità di cella vale l'ultima modifica del lotto.
    const writes = new Map<string, { profile_id: string; date: string; rows: DayRow[] }>();
    for (const change of list) {
      const k = dayKey(change.profileId, change.date);
      if (!days.has(change.date)) {
        errors.push({ ...change, message: "Giorno fuori dalla settimana." });
        continue;
      }
      // Giorno di assenza: dal foglio si può solo svuotare; il resto passa dal dettaglio.
      if (absentDays.has(k) && change.value.trim() !== "") {
        errors.push({
          ...change,
          message: "Giornata di assenza: modifica il turno dal dettaglio del giorno.",
        });
        continue;
      }
      const parsed = parseShiftCell(change.value, tplInput);
      if (parsed.kind === "error") {
        errors.push({ profileId: change.profileId, date: change.date, message: parsed.message });
        continue;
      }
      const existing = existingByDay.get(k) ?? [];
      const homeZone = zoneOf.get(change.profileId);
      let rows: DayRow[];
      if (parsed.kind === "empty") {
        rows = [];
      } else if (parsed.kind === "template") {
        const tpl = tplByCode.get(parsed.code)!;
        const segments =
          tpl.isAbsence || !tpl.startTime || !tpl.endTime
            ? []
            : [{ start: tpl.startTime, end: tpl.endTime }];
        rows = buildDayRows(
          change.profileId,
          change.date,
          existing,
          segments,
          { templateId: tpl.id, breakMinutes: tpl.breakMinutes, keepDetailsIfSameTimes: true },
          homeZone,
        );
      } else {
        rows = buildDayRows(
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

export async function saveWeekAsTemplate(weekId: string, name: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const week = await loadWeek(supabase, z.uuid().parse(weekId));
    const cleanName = z.string().trim().min(2, "Dai un nome al modello.").max(60).parse(name);
    const { data: shifts } = await supabase.from("shifts").select("*").eq("week_id", week.id);
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
    return { ok: true, message: `Modello "${cleanName}" salvato.` };
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
