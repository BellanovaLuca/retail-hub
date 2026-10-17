"use server";

import { addDays, format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, dbErrorMessage, runAction, type ActionResult } from "@/lib/auth/guards";
import { buildRuleContext, getVariables, variablesMap } from "@/lib/data/rules";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";
import { evaluateRules, validateRuleParams } from "@/lib/rules/registry";
import type { RuleRecord } from "@/lib/rules/types";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Orario non valido.");

const ruleSchema = z
  .object({
    id: z.uuid().optional(),
    ruleSetId: z.uuid(),
    name: z.string().trim().min(2, "Dai un nome alla regola.").max(80),
    type: z.string().min(1),
    params: z.unknown(),
    days: z.array(z.number().int().min(1).max(7)).max(7),
    timeWindows: z
      .array(z.object({ start: time, end: time }))
      .max(6)
      .refine((w) => w.every((x) => x.end > x.start), "Ogni fascia deve finire dopo l'inizio."),
    validFrom: z.iso.date().nullable(),
    validTo: z.iso.date().nullable(),
    severity: z.enum(["warning", "info"]),
    active: z.boolean(),
  })
  .refine((r) => !r.validFrom || !r.validTo || r.validTo >= r.validFrom, {
    message: "La fine del periodo deve seguire l'inizio.",
    path: ["validTo"],
  });

export type RuleInput = z.input<typeof ruleSchema>;

const done = (message: string): ActionResult => {
  revalidatePath("/admin/impostazioni/regole");
  revalidatePath("/admin/turni", "layout");
  return { ok: true, message };
};

export async function saveRule(input: RuleInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = ruleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const v = parsed.data;
    const params = validateRuleParams(v.type, v.params);
    if (!params.ok) return { ok: false, message: `Parametri non validi: ${params.error}` };

    const row = {
      rule_set_id: v.ruleSetId,
      name: v.name,
      type: v.type,
      params: params.params as never,
      days: v.days,
      time_windows: v.timeWindows,
      valid_from: v.validFrom,
      valid_to: v.validTo,
      severity: v.severity,
      active: v.active,
    };
    if (v.id) {
      const { error } = await supabase.from("planning_rules").update(row).eq("id", v.id);
      if (error) return { ok: false, message: dbErrorMessage(error, "Regola non salvata.") };
      return done("Regola aggiornata.");
    }
    const { count } = await supabase
      .from("planning_rules")
      .select("id", { count: "exact", head: true })
      .eq("rule_set_id", v.ruleSetId);
    const { error } = await supabase
      .from("planning_rules")
      .insert({ ...row, sort_order: (count ?? 0) + 1 });
    if (error) return { ok: false, message: dbErrorMessage(error, "Regola non creata.") };
    return done("Regola creata.");
  });
}

export async function setRuleActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("planning_rules")
      .update({ active })
      .eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita.") };
    return done(active ? "Regola attivata." : "Regola disattivata.");
  });
}

export async function deleteRule(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase.from("planning_rules").delete().eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: dbErrorMessage(error, "Regola non eliminata.") };
    return done("Regola eliminata.");
  });
}

export async function moveRule(id: string, direction: -1 | 1): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { data: rule } = await supabase
      .from("planning_rules")
      .select("rule_set_id")
      .eq("id", z.uuid().parse(id))
      .single();
    if (!rule) return { ok: false, message: "Regola non trovata." };
    const { data: list } = await supabase
      .from("planning_rules")
      .select("id")
      .eq("rule_set_id", rule.rule_set_id)
      .order("sort_order");
    const ids = (list ?? []).map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await Promise.all(
      ids.map((rid, k) =>
        supabase
          .from("planning_rules")
          .update({ sort_order: k + 1 })
          .eq("id", rid),
      ),
    );
    return done("Ordine aggiornato.");
  });
}

export async function saveRuleSet(input: {
  id?: string;
  name: string;
  description: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const v = z
      .object({
        id: z.uuid().optional(),
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(300),
      })
      .parse(input);
    const row = { name: v.name, description: v.description || null };
    const { data, error } = v.id
      ? await supabase.from("planning_rule_sets").update(row).eq("id", v.id).select("id").single()
      : await supabase.from("planning_rule_sets").insert(row).select("id").single();
    if (error || !data) return { ok: false, message: dbErrorMessage(error, "Set non salvato.") };
    revalidatePath("/admin/impostazioni/regole");
    return { ok: true, message: "Set salvato.", data: { id: data.id } };
  });
}

/** Nuovo set duplicando uno esistente (es. "Saldi" da "Standard"). */
export async function duplicateRuleSet(
  id: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const cleanName = z.string().trim().min(2, "Dai un nome al nuovo set.").max(60).parse(name);
    const { data: source } = await supabase
      .from("planning_rule_sets")
      .select("*")
      .eq("id", z.uuid().parse(id))
      .single();
    if (!source) return { ok: false, message: "Set non trovato." };
    const { data: created, error } = await supabase
      .from("planning_rule_sets")
      .insert({ name: cleanName, description: source.description })
      .select("id")
      .single();
    if (error || !created) return { ok: false, message: dbErrorMessage(error, "Set non creato.") };
    const { data: rules } = await supabase.from("planning_rules").select("*").eq("rule_set_id", id);
    if (rules?.length) {
      await supabase.from("planning_rules").insert(
        rules.map(({ id: _id, created_at: _c, updated_at: _u, ...r }) => ({
          ...r,
          rule_set_id: created.id,
        })),
      );
    }
    revalidatePath("/admin/impostazioni/regole");
    return { ok: true, message: `Set "${cleanName}" creato.`, data: { id: created.id } };
  });
}

export async function setDefaultRuleSet(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    await supabase.from("planning_rule_sets").update({ is_default: false }).eq("is_default", true);
    const { error } = await supabase
      .from("planning_rule_sets")
      .update({ is_default: true })
      .eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita.") };
    return done("Set predefinito aggiornato.");
  });
}

export async function deleteRuleSet(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { data: set } = await supabase
      .from("planning_rule_sets")
      .select("is_default")
      .eq("id", z.uuid().parse(id))
      .single();
    if (set?.is_default) return { ok: false, message: "Il set predefinito non si può eliminare." };
    const { error } = await supabase.from("planning_rule_sets").delete().eq("id", id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Set non eliminato.") };
    return done("Set eliminato.");
  });
}

const variableSchema = z.object({
  id: z.uuid().optional(),
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, "Nome: minuscole, cifre e trattino basso (es. min_sole_sera)."),
  label: z.string().trim().min(2).max(80),
  value: z.number().finite(),
  unit: z.string().trim().max(20),
  description: z.string().trim().max(300),
});

export async function saveVariable(input: z.input<typeof variableSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = variableSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const { id, ...v } = parsed.data;
    const row = { ...v, unit: v.unit || null, description: v.description || null };
    const { error } = id
      ? await supabase.from("planning_variables").update(row).eq("id", id)
      : await supabase.from("planning_variables").insert(row);
    if (error) return { ok: false, message: dbErrorMessage(error, "Variabile non salvata.") };
    return done("Variabile salvata: tutte le regole che la usano sono aggiornate.");
  });
}

export async function deleteVariable(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("planning_variables")
      .delete()
      .eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: dbErrorMessage(error, "Variabile non eliminata.") };
    return done(
      "Variabile eliminata. Le regole che la usavano verranno segnalate come da correggere.",
    );
  });
}

/** Anteprima: quante violazioni produrrebbe la regola nella settimana in corso e nella precedente. */
export async function previewRule(
  input: RuleInput,
  variableOverrides?: Record<string, number>,
): Promise<ActionResult<{ current: number; previous: number; samples: string[] }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = ruleSchema.safeParse({ ...input, ruleSetId: input.ruleSetId });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const v = parsed.data;
    const rule: RuleRecord = {
      id: v.id ?? "anteprima",
      name: v.name,
      type: v.type,
      params: v.params,
      days: v.days,
      timeWindows: v.timeWindows,
      validFrom: v.validFrom,
      validTo: v.validTo,
      severity: v.severity,
      active: true,
    };
    const current = toISODate(weekStart(nowInRome()));
    const previous = format(addDays(parseISO(current), -7), "yyyy-MM-dd");
    const vars = { ...variablesMap(await getVariables(supabase)), ...(variableOverrides ?? {}) };
    const [ctxCurrent, ctxPrevious] = await Promise.all([
      buildRuleContext(supabase, current),
      buildRuleContext(supabase, previous),
    ]);
    const a = evaluateRules({ ...ctxCurrent, variables: vars }, [rule]);
    const b = evaluateRules({ ...ctxPrevious, variables: vars }, [rule]);
    return {
      ok: true,
      data: {
        current: a.length,
        previous: b.length,
        samples: [...a, ...b].slice(0, 5).map((x) => x.message),
      },
    };
  });
}

/** Ignora un avviso per quella settimana (e giorno), con una nota; resta nel registro. */
export async function ignoreViolation(input: {
  weekId: string;
  ruleId: string;
  date: string | null;
  note: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const v = z
      .object({
        weekId: z.uuid(),
        ruleId: z.uuid(),
        date: z.iso.date().nullable(),
        note: z.string().trim().min(2, "Scrivi una nota (es. inventario).").max(200),
      })
      .safeParse(input);
    if (!v.success) return { ok: false, message: v.error.issues[0].message };
    const { error } = await supabase.from("rule_overrides").insert({
      week_id: v.data.weekId,
      rule_id: v.data.ruleId,
      date: v.data.date,
      note: v.data.note,
      created_by: profile.id,
    });
    if (error) return { ok: false, message: dbErrorMessage(error, "Avviso non ignorato.") };
    revalidatePath("/admin/turni", "layout");
    return { ok: true, message: "Avviso ignorato per questa settimana." };
  });
}

export async function restoreViolation(overrideId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("rule_overrides")
      .delete()
      .eq("id", z.uuid().parse(overrideId));
    if (error) return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita.") };
    revalidatePath("/admin/turni", "layout");
    return { ok: true, message: "Avviso ripristinato." };
  });
}
