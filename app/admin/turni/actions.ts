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
import { getSchedulePeople, getTemplates, toShiftRecord } from "@/lib/data/schedule";
import { publishSnapshot } from "@/lib/schedule/publish";
import { parseShiftCell } from "@/lib/shifts/parse";
import type { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/types";

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

type Segment = { start: string; end: string; isBackOffice?: boolean | null };
type DayOptions = {
  templateId?: string | null;
  breakMinutes?: number;
  departmentId?: string | null;
  zone?: "vista" | "sole" | null;
  note?: string | null;
  isBackOffice?: boolean | null;
};

/**
 * Sostituisce i turni di una persona in un giorno. Mantiene reparto, area, back office
 * e nota della giornata precedente se non indicati.
 */
async function replaceDay(
  db: Db,
  weekId: string,
  profileId: string,
  date: string,
  segments: Segment[],
  opts: DayOptions,
  homeZone: "vista" | "sole" | "jolly" | undefined,
) {
  const { data: existing } = await db
    .from("shifts")
    .select("*")
    .eq("profile_id", profileId)
    .eq("date", date)
    .order("start_time");
  const prev = existing?.[0];
  // Un turno di lavoro in un giorno di assenza a giornata intera resta segnalato come conflitto.
  const { data: leave } = await db
    .from("leaves")
    .select("hours")
    .eq("profile_id", profileId)
    .eq("date", date)
    .maybeSingle();
  const conflict = Boolean(leave && !leave.hours && segments.length > 0);

  const { error: delError } = await db
    .from("shifts")
    .delete()
    .eq("profile_id", profileId)
    .eq("date", date);
  if (delError) throw new ActionError(dbErrorMessage(delError, "Turno non salvato."));
  if (segments.length === 0 && !opts.templateId) return;

  const zone =
    opts.zone !== undefined
      ? opts.zone
      : (prev?.zone ?? (homeZone && homeZone !== "jolly" ? homeZone : null));
  const base = {
    week_id: weekId,
    profile_id: profileId,
    date,
    working_as_department_id:
      opts.departmentId !== undefined
        ? opts.departmentId
        : (prev?.working_as_department_id ?? null),
    zone,
    note: opts.note !== undefined ? opts.note : (prev?.note ?? null),
    conflict,
  };

  const rows: TablesInsert<"shifts">[] =
    segments.length === 0
      ? [
          {
            ...base,
            template_id: opts.templateId!,
            start_time: null,
            end_time: null,
            break_minutes: 0,
            is_back_office: null,
          },
        ]
      : segments.map((seg, i) => ({
          ...base,
          template_id: segments.length === 1 ? (opts.templateId ?? null) : null,
          start_time: seg.start,
          end_time: seg.end,
          // La pausa esplicita vale per il pezzo più lungo; i vuoti tra pezzi sono già pausa.
          break_minutes: i === 0 ? (opts.breakMinutes ?? 0) : 0,
          is_back_office:
            seg.isBackOffice !== undefined
              ? seg.isBackOffice
              : opts.isBackOffice !== undefined
                ? opts.isBackOffice
                : (prev?.is_back_office ?? null),
        }));

  const { error } = await db.from("shifts").insert(rows);
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
    const days = new Set(
      Array.from({ length: 7 }, (_, i) =>
        format(addDays(parseISO(week.week_start), i), "yyyy-MM-dd"),
      ),
    );
    const [templates, people] = await Promise.all([
      getTemplates(supabase),
      getSchedulePeople(supabase),
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
    const errors: { profileId: string; date: string; message: string }[] = [];
    const { data: leaveRows } = await supabase
      .from("leaves")
      .select("profile_id, date, hours")
      .gte("date", week.week_start)
      .lte("date", format(addDays(parseISO(week.week_start), 6), "yyyy-MM-dd"));
    const absentDays = new Set(
      (leaveRows ?? []).filter((l) => !l.hours).map((l) => `${l.profile_id}|${l.date}`),
    );

    for (const change of list) {
      if (!days.has(change.date)) {
        errors.push({ ...change, message: "Giorno fuori dalla settimana." });
        continue;
      }
      // Giorno di assenza: dal foglio si può solo svuotare; il resto passa dal dettaglio.
      if (absentDays.has(`${change.profileId}|${change.date}`) && change.value.trim() !== "") {
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
      if (parsed.kind === "empty") {
        await replaceDay(
          supabase,
          week.id,
          change.profileId,
          change.date,
          [],
          {},
          zoneOf.get(change.profileId),
        );
      } else if (parsed.kind === "template") {
        const tpl = tplByCode.get(parsed.code)!;
        const segments =
          tpl.isAbsence || !tpl.startTime || !tpl.endTime
            ? []
            : [{ start: tpl.startTime, end: tpl.endTime }];
        await replaceDay(
          supabase,
          week.id,
          change.profileId,
          change.date,
          segments,
          { templateId: tpl.id, breakMinutes: tpl.breakMinutes },
          zoneOf.get(change.profileId),
        );
      } else {
        await replaceDay(
          supabase,
          week.id,
          change.profileId,
          change.date,
          parsed.segments,
          { templateId: null, breakMinutes: 0 },
          zoneOf.get(change.profileId),
        );
      }
    }

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
    const segments = [...v.segments].sort((a, b) => a.start.localeCompare(b.start));
    await replaceDay(
      supabase,
      week.id,
      v.profileId,
      v.date,
      segments,
      {
        templateId: v.templateId,
        breakMinutes: v.breakMinutes,
        departmentId: v.departmentId,
        zone: v.zone,
        note: v.note || null,
      },
      undefined,
    );
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

/** Copia i turni della settimana precedente nelle giornate ancora vuote (salta ferie e assenze). */
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
    return copyShifts(
      supabase,
      week,
      (await supabase.from("shifts").select("*").eq("week_id", prevWeek.id)).data ?? [],
      7,
    );
  });
}

type DbShift = Parameters<typeof toShiftRecord>[0] & { template_id: string | null };

async function copyShifts(
  db: Db,
  week: { id: string; week_start: string },
  source: DbShift[],
  dayOffset: number | ((s: DbShift) => string),
): Promise<ActionResult> {
  const days = Array.from({ length: 7 }, (_, i) =>
    format(addDays(parseISO(week.week_start), i), "yyyy-MM-dd"),
  );
  const [{ data: current }, { data: leaves }, { data: active }] = await Promise.all([
    db.from("shifts").select("profile_id, date").eq("week_id", week.id),
    db.from("leaves").select("profile_id, date").gte("date", days[0]).lte("date", days[6]),
    db.from("profiles").select("id").eq("active", true),
  ]);
  const taken = new Set(
    [...(current ?? []), ...(leaves ?? [])].map((s) => `${s.profile_id}|${s.date}`),
  );
  const activeIds = new Set((active ?? []).map((p) => p.id));

  const rows = source
    .map((s) => ({
      week_id: week.id,
      profile_id: s.profile_id,
      date:
        typeof dayOffset === "number"
          ? format(addDays(parseISO(s.date), dayOffset), "yyyy-MM-dd")
          : dayOffset(s),
      template_id: s.template_id,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      working_as_department_id: s.working_as_department_id,
      zone: s.zone,
      is_back_office: s.is_back_office,
      note: s.note,
    }))
    .filter(
      (r) =>
        activeIds.has(r.profile_id) &&
        days.includes(r.date) &&
        !taken.has(`${r.profile_id}|${r.date}`),
    );

  if (rows.length === 0)
    return { ok: true, message: "Nessuna giornata da copiare: sono già tutte compilate." };
  const { error } = await db.from("shifts").insert(rows);
  if (error) return { ok: false, message: dbErrorMessage(error, "Copia non riuscita.") };
  revalidateWeek(week.week_start);
  const filled = new Set(rows.map((r) => `${r.profile_id}|${r.date}`)).size;
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
    const source = (tpl.shifts as unknown as (DbShift & { weekday: number })[]).map((s) => ({
      ...s,
      id: "",
      date: format(addDays(parseISO(week.week_start), s.weekday - 1), "yyyy-MM-dd"),
      conflict: false,
    }));
    return copyShifts(supabase, week, source, 0);
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
    return { ok: true, message: "Nota salvata: sarà visibile alla prossima pubblicazione." };
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
