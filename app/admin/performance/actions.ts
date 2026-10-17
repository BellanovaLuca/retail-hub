"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  adminAction,
  dbErrorMessage,
  runAction,
  type ActionResult,
} from "@/lib/auth/guards";
import { ensurePeriod, getPeriod } from "@/lib/data/performance";
import { notify } from "@/lib/notifications";
import {
  PROGRESS_VALUES,
  isGoalDefined,
  planApplyToDepartment,
  planCopyFromPrevious,
  slotKey,
} from "@/lib/performance/goals";
import type { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/types";

type Db = Awaited<ReturnType<typeof createClient>>;

const year = z.number().int().min(2000).max(2100);
const pillar = z.enum(["achievement", "leadership"]);
const slot = z.number().int().min(1).max(3);
const text = (max: number) =>
  z
    .string()
    .max(max, `Massimo ${max} caratteri.`)
    .transform((v) => v.trim());
const optionalText = (max: number) => text(max).transform((v) => (v === "" ? null : v));

function revalidate(y: number, profileId?: string) {
  revalidatePath(`/admin/performance/${y}`);
  if (profileId) revalidatePath(`/admin/performance/${y}/${profileId}`);
  revalidatePath("/performance");
}

/* ------------------------------------------------------------ scheda */

const goalSchema = z.object({
  pillar,
  slot,
  title: text(120),
  objective: text(2000),
  progress: z.enum(PROGRESS_VALUES as [string, ...string[]]).nullable(),
  comment: optionalText(2000),
  privateNote: optionalText(2000),
});

const sheetSchema = z.object({
  year,
  profileId: z.uuid(),
  goals: z.array(goalSchema).min(1).max(6),
});

/** Salva i 6 spazi di una persona. Gli spazi del tutto vuoti e mai creati non generano righe. */
export async function saveGoalSheet(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = sheetSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Dati non validi." };
    }
    const { year: y, profileId, goals } = parsed.data;
    const { supabase } = await adminAction();
    const period = await ensurePeriod(supabase, y);
    const { data: existing } = await supabase
      .from("performance_goals")
      .select("pillar, slot")
      .eq("period_id", period.id)
      .eq("profile_id", profileId);
    const known = new Set((existing ?? []).map((g) => slotKey(g.pillar, g.slot)));

    const rows: TablesInsert<"performance_goals">[] = goals
      .filter(
        (g) =>
          known.has(slotKey(g.pillar, g.slot)) ||
          g.title ||
          g.objective ||
          g.progress ||
          g.comment ||
          g.privateNote,
      )
      .map((g) => ({
        profile_id: profileId,
        period_id: period.id,
        pillar: g.pillar,
        slot: g.slot,
        title: g.title,
        objective: g.objective,
        progress: g.progress as TablesInsert<"performance_goals">["progress"],
        comment: g.comment,
        private_note: g.privateNote,
      }));
    if (rows.length) {
      const { error } = await supabase
        .from("performance_goals")
        .upsert(rows, { onConflict: "profile_id,period_id,pillar,slot" });
      if (error) throw new ActionError(dbErrorMessage(error, "Scheda non salvata."));
    }
    revalidate(y, profileId);
    return { ok: true, message: "Scheda salvata." };
  });
}

/* ------------------------------------------------- copia dall'anno prima */

const copySchema = z.object({ year, profileId: z.uuid().optional() });

/** Copia titolo e obiettivo dall'anno precedente negli spazi ancora vuoti (mai sovrascrive). */
export async function copyFromPreviousPeriod(
  input: unknown,
): Promise<ActionResult<{ copied: number }>> {
  return runAction(async () => {
    const parsed = copySchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const { year: y, profileId } = parsed.data;
    const { supabase } = await adminAction();
    const previous = await getPeriod(supabase, y - 1);
    if (!previous) return { ok: false, message: `Non c'è un periodo ${y - 1} da cui copiare.` };
    const period = await ensurePeriod(supabase, y);

    const load = async (periodId: string) => {
      let q = supabase
        .from("performance_goals")
        .select("profile_id, pillar, slot, title, objective")
        .eq("period_id", periodId);
      if (profileId) q = q.eq("profile_id", profileId);
      const { data, error } = await q;
      if (error) throw new ActionError(dbErrorMessage(error, "Obiettivi non disponibili."));
      return data ?? [];
    };
    const [before, now, { data: active }] = await Promise.all([
      load(previous.id),
      load(period.id),
      supabase.from("profiles").select("id").eq("active", true),
    ]);
    const activeIds = new Set((active ?? []).map((p) => p.id));

    const rows: TablesInsert<"performance_goals">[] = [];
    for (const pid of new Set(before.map((g) => g.profile_id))) {
      if (!activeIds.has(pid)) continue;
      const plan = planCopyFromPrevious(
        now.filter((g) => g.profile_id === pid),
        before.filter((g) => g.profile_id === pid),
      );
      for (const p of plan) {
        rows.push({ profile_id: pid, period_id: period.id, ...p });
      }
    }
    if (rows.length) {
      // Solo titolo e obiettivo: stato, commenti e note dell'anno nuovo restano quelli che sono.
      const { error } = await supabase
        .from("performance_goals")
        .upsert(rows, { onConflict: "profile_id,period_id,pillar,slot" });
      if (error) throw new ActionError(dbErrorMessage(error, "Copia non riuscita."));
    }
    revalidate(y, profileId);
    return {
      ok: true,
      message: rows.length
        ? `Copiati ${rows.length} ${rows.length === 1 ? "obiettivo" : "obiettivi"} dal ${y - 1}.`
        : `Niente da copiare: gli spazi sono già compilati o il ${y - 1} è vuoto.`,
      data: { copied: rows.length },
    };
  });
}

/* --------------------------------------------- stesso obiettivo al reparto */

const departmentSchema = z.object({
  year,
  departmentId: z.uuid(),
  pillar,
  slot,
  title: text(120),
  objective: text(2000),
  overwrite: z.boolean().default(false),
});

/** Copia titolo e obiettivo di uno spazio a tutte le persone attive del reparto principale. */
export async function applyGoalToDepartment(
  input: unknown,
): Promise<ActionResult<{ written: number; skipped: number }>> {
  return runAction(async () => {
    const parsed = departmentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Dati non validi." };
    }
    const v = parsed.data;
    if (!v.title && !v.objective) {
      return { ok: false, message: "Scrivi almeno il titolo o l'obiettivo." };
    }
    const { supabase } = await adminAction();
    const period = await ensurePeriod(supabase, v.year);

    const [{ data: members }, { data: active }] = await Promise.all([
      supabase
        .from("profile_departments")
        .select("profile_id")
        .eq("department_id", v.departmentId)
        .eq("is_primary", true),
      supabase.from("profiles").select("id").eq("active", true),
    ]);
    const activeIds = new Set((active ?? []).map((p) => p.id));
    const ids = (members ?? []).map((m) => m.profile_id).filter((id) => activeIds.has(id));
    if (ids.length === 0) return { ok: false, message: "Nessuna persona attiva nel reparto." };

    const { data: existing } = await supabase
      .from("performance_goals")
      .select("profile_id, title, objective")
      .eq("period_id", period.id)
      .eq("pillar", v.pillar)
      .eq("slot", v.slot)
      .in("profile_id", ids);
    const plan = planApplyToDepartment(
      ids,
      new Map((existing ?? []).map((g) => [g.profile_id, g])),
      v.overwrite,
    );
    if (plan.write.length) {
      const { error } = await supabase.from("performance_goals").upsert(
        plan.write.map((pid) => ({
          profile_id: pid,
          period_id: period.id,
          pillar: v.pillar,
          slot: v.slot,
          title: v.title,
          objective: v.objective,
        })),
        { onConflict: "profile_id,period_id,pillar,slot" },
      );
      if (error) throw new ActionError(dbErrorMessage(error, "Obiettivo non applicato."));
    }
    revalidatePath(`/admin/performance/${v.year}`, "layout");
    revalidatePath("/performance");
    const skipped = plan.skipped.length;
    return {
      ok: true,
      message: `Applicato a ${plan.write.length} ${plan.write.length === 1 ? "persona" : "persone"}${skipped ? ` · ${skipped} con un obiettivo già scritto ${skipped === 1 ? "lasciata" : "lasciate"} com'era` : ""}.`,
      data: { written: plan.write.length, skipped },
    };
  });
}

/* -------------------------------------------------------- pubblicazione */

const publishSchema = z.object({ year, profileId: z.uuid().optional() });

async function definedGoals(db: Db, periodId: string, profileId?: string) {
  let q = db
    .from("performance_goals")
    .select("id, profile_id, title, objective, published")
    .eq("period_id", periodId);
  if (profileId) q = q.eq("profile_id", profileId);
  const { data, error } = await q;
  if (error) throw new ActionError(dbErrorMessage(error, "Obiettivi non disponibili."));
  return (data ?? []).filter(isGoalDefined);
}

/**
 * Pubblica gli obiettivi definiti di una persona o di tutto il periodo. Chi riceve obiettivi
 * nuovi riceve la notifica in-app `performance_published`.
 */
export async function publishGoals(input: unknown): Promise<ActionResult<{ published: number }>> {
  return runAction(async () => {
    const parsed = publishSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const { year: y, profileId } = parsed.data;
    const { supabase } = await adminAction();
    const period = await getPeriod(supabase, y);
    if (!period) return { ok: false, message: "Periodo non trovato." };

    const goals = await definedGoals(supabase, period.id, profileId);
    const toPublish = goals.filter((g) => !g.published);
    if (goals.length === 0) return { ok: false, message: "Non ci sono obiettivi da pubblicare." };
    if (toPublish.length === 0) {
      return { ok: true, message: "Già tutto pubblicato.", data: { published: 0 } };
    }
    const { error } = await supabase
      .from("performance_goals")
      .update({ published: true, published_at: new Date().toISOString() })
      .in(
        "id",
        toPublish.map((g) => g.id),
      );
    if (error) throw new ActionError(dbErrorMessage(error, "Pubblicazione non riuscita."));

    const people = [...new Set(toPublish.map((g) => g.profile_id))];
    await notify(people, {
      kind: "performance_published",
      title: `Obiettivi di performance ${y}`,
      body: "I tuoi obiettivi Achievement e Leadership sono online.",
      link: `/performance?anno=${y}`,
    });
    revalidate(y, profileId);
    return {
      ok: true,
      message: `Pubblicati ${toPublish.length} ${toPublish.length === 1 ? "obiettivo" : "obiettivi"} · ${people.length} ${people.length === 1 ? "persona avvisata" : "persone avvisate"}.`,
      data: { published: toPublish.length },
    };
  });
}

/** Ritira la pubblicazione di una persona (gli obiettivi tornano invisibili al dipendente). */
export async function unpublishGoals(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = z.object({ year, profileId: z.uuid() }).safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const { year: y, profileId } = parsed.data;
    const { supabase } = await adminAction();
    const period = await getPeriod(supabase, y);
    if (!period) return { ok: false, message: "Periodo non trovato." };
    const { error } = await supabase
      .from("performance_goals")
      .update({ published: false, published_at: null })
      .eq("period_id", period.id)
      .eq("profile_id", profileId);
    if (error) throw new ActionError(dbErrorMessage(error, "Operazione non riuscita."));
    revalidate(y, profileId);
    return { ok: true, message: "Pubblicazione ritirata." };
  });
}
