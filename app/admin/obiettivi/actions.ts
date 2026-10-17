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
import { setNameForZone } from "@/lib/data/targets";
import { weekNumber } from "@/lib/dates";
import { createsCycle, parseRule, ruleSchema } from "@/lib/kpi/rules";
import { notify } from "@/lib/notifications";
import type { createClient } from "@/lib/supabase/server";
import type { DefaultTargetRule } from "@/lib/targets";

type Db = Awaited<ReturnType<typeof createClient>>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monday = isoDate.refine(
  (d) => parseISO(d).getDay() === 1,
  "Serve il lunedì della settimana.",
);
const num = (max: number) => z.number().min(0).max(max);

const revalidateWeek = (weekStart: string) =>
  revalidatePath(`/admin/obiettivi/${weekStart}`, "layout");

const weekLabel = (weekStart: string) => `Week ${weekNumber(parseISO(weekStart))}`;

/* ---------------------------------------------------------- assegnazione */

const storeSchema = z.object({
  totalHours: num(10_000),
  vistaValueEur: num(10_000_000),
  vistaAvgPrice: num(100_000),
  vistaWo: z.number().int().min(0).max(100_000),
  solePieces: z.number().int().min(0).max(100_000),
  soleValueEur: num(10_000_000),
  soleAvgPrice: num(100_000),
});

const assignmentSchema = z.object({
  weekStart: monday,
  store: storeSchema,
  cells: z
    .array(
      z.object({
        profileId: z.uuid(),
        kpiId: z.uuid(),
        target: num(100_000),
        overridden: z.boolean(),
      }),
    )
    .max(2000),
  notify: z.boolean().default(true),
});

/** Copia le voci del gruppo della sua area a chi non ha ancora voci proprie (§8.3). */
async function ensureProfileKpis(db: Db, profileIds: string[]) {
  if (profileIds.length === 0) return;
  const [{ data: existing }, { data: profiles }, { data: sets }, { data: items }] =
    await Promise.all([
      db.from("profile_kpis").select("profile_id").in("profile_id", profileIds),
      db.from("profiles").select("id, home_zone").in("id", profileIds),
      db.from("kpi_sets").select("id, name"),
      db.from("kpi_set_items").select("set_id, kpi_id, label_override, sort_order"),
    ]);
  const has = new Set((existing ?? []).map((e) => e.profile_id));
  const rows = (profiles ?? [])
    .filter((p) => !has.has(p.id))
    .flatMap((p) => {
      const set = (sets ?? []).find((s) => s.name === setNameForZone(p.home_zone));
      return (items ?? [])
        .filter((i) => i.set_id === set?.id)
        .map((i) => ({
          profile_id: p.id,
          kpi_id: i.kpi_id,
          label_override: i.label_override,
          sort_order: i.sort_order,
        }));
    });
  if (rows.length === 0) return;
  const { error } = await db
    .from("profile_kpis")
    .upsert(rows, { onConflict: "profile_id,kpi_id", ignoreDuplicates: true });
  if (error) throw new ActionError(dbErrorMessage(error, "Voci delle persone non salvate."));
}

/**
 * Conferma l'assegnazione: salva gli obiettivi del negozio e quelli di ogni persona
 * (upsert, con `overridden` per le celle corrette a mano) e avvisa le persone.
 */
export async function confirmAssignment(
  input: z.input<typeof assignmentSchema>,
): Promise<ActionResult<{ people: number }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = assignmentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Controlla i numeri inseriti." };
    const { weekStart, store, cells } = parsed.data;

    const { error: storeError } = await supabase.from("store_weekly_targets").upsert(
      {
        week_start: weekStart,
        total_hours: store.totalHours,
        vista_value_eur: store.vistaValueEur,
        vista_avg_price: store.vistaAvgPrice,
        vista_wo: store.vistaWo,
        sole_pieces: store.solePieces,
        sole_value_eur: store.soleValueEur,
        sole_avg_price: store.soleAvgPrice,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "week_start" },
    );
    if (storeError)
      throw new ActionError(dbErrorMessage(storeError, "Obiettivi del negozio non salvati."));

    const profileIds = [...new Set(cells.map((c) => c.profileId))];
    if (cells.length) {
      const { error } = await supabase.from("weekly_targets").upsert(
        cells.map((c) => ({
          profile_id: c.profileId,
          week_start: weekStart,
          kpi_id: c.kpiId,
          target: c.target,
          overridden: c.overridden,
        })),
        { onConflict: "profile_id,week_start,kpi_id" },
      );
      if (error) throw new ActionError(dbErrorMessage(error, "Obiettivi non salvati."));
    }

    // Celle svuotate (voce senza obiettivo): si tolgono le righe salvate in precedenza.
    if (profileIds.length) {
      const { data: existing } = await supabase
        .from("weekly_targets")
        .select("id, profile_id, kpi_id")
        .eq("week_start", weekStart)
        .in("profile_id", profileIds);
      const keep = new Set(cells.map((c) => `${c.profileId}|${c.kpiId}`));
      const stale = (existing ?? []).filter((e) => !keep.has(`${e.profile_id}|${e.kpi_id}`));
      if (stale.length) {
        const { error } = await supabase
          .from("weekly_targets")
          .delete()
          .in(
            "id",
            stale.map((s) => s.id),
          );
        if (error) throw new ActionError(dbErrorMessage(error, "Obiettivi non aggiornati."));
      }
    }

    await ensureProfileKpis(supabase, profileIds);

    if (parsed.data.notify && profileIds.length) {
      await notify(profileIds, {
        kind: "targets_assigned",
        title: `Obiettivi della ${weekLabel(weekStart)}`,
        body: "Sono pronti i tuoi obiettivi della settimana: compila i numeri ogni giorno.",
        link: `/obiettivi?settimana=${weekStart}`,
      });
    }
    revalidateWeek(weekStart);
    return {
      ok: true,
      message: `Obiettivi confermati per ${profileIds.length} ${profileIds.length === 1 ? "persona" : "persone"}.`,
      data: { people: profileIds.length },
    };
  });
}

export type PreviousAssignment = {
  weekStart: string;
  store: z.output<typeof storeSchema> | null;
  targets: { profileId: string; kpiId: string; target: number; overridden: boolean }[];
};

/** "Copia dalla settimana precedente": obiettivi del negozio e celle della settimana prima. */
export async function getPreviousAssignment(
  weekStart: string,
): Promise<ActionResult<PreviousAssignment>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const week = monday.parse(weekStart);
    const prev = format(addDays(parseISO(week), -7), "yyyy-MM-dd");
    const [{ data: store }, { data: targets }] = await Promise.all([
      supabase.from("store_weekly_targets").select("*").eq("week_start", prev).maybeSingle(),
      supabase
        .from("weekly_targets")
        .select("profile_id, kpi_id, target, overridden")
        .eq("week_start", prev),
    ]);
    if (!store && !targets?.length)
      return { ok: false, message: `Nessun obiettivo salvato nella ${weekLabel(prev)}.` };
    const n = (v: number | null) => Number(v ?? 0);
    return {
      ok: true,
      data: {
        weekStart: prev,
        store: store
          ? {
              totalHours: n(store.total_hours),
              vistaValueEur: n(store.vista_value_eur),
              vistaAvgPrice: n(store.vista_avg_price),
              vistaWo: n(store.vista_wo),
              solePieces: n(store.sole_pieces),
              soleValueEur: n(store.sole_value_eur),
              soleAvgPrice: n(store.sole_avg_price),
            }
          : null,
        targets: (targets ?? []).map((t) => ({
          profileId: t.profile_id,
          kpiId: t.kpi_id,
          target: Number(t.target),
          overridden: t.overridden,
        })),
      },
    };
  });
}

/* ------------------------------------------------------------- persone */

const adminEntriesSchema = z.object({
  profileId: z.uuid(),
  weekStart: monday,
  changes: z
    .array(
      z.object({
        kpiId: z.uuid(),
        date: isoDate,
        value: z.number().min(0).max(99_999).nullable(),
      }),
    )
    .min(1)
    .max(500),
});

/** Correzione dei numeri giornalieri di una persona da parte dell'admin. */
export async function saveEntriesAsAdmin(
  input: z.input<typeof adminEntriesSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = adminEntriesSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Numeri non validi." };
    const { profileId, changes } = parsed.data;
    const upserts = changes.filter((c) => c.value !== null);
    if (upserts.length) {
      const { error } = await supabase.from("daily_entries").upsert(
        upserts.map((c) => ({
          profile_id: profileId,
          kpi_id: c.kpiId,
          date: c.date,
          value: c.value!,
        })),
        { onConflict: "profile_id,date,kpi_id" },
      );
      if (error) throw new ActionError(dbErrorMessage(error, "Numeri non salvati."));
    }
    for (const c of changes.filter((x) => x.value === null)) {
      const { error } = await supabase
        .from("daily_entries")
        .delete()
        .eq("profile_id", profileId)
        .eq("kpi_id", c.kpiId)
        .eq("date", c.date);
      if (error) throw new ActionError(dbErrorMessage(error, "Numeri non salvati."));
    }
    return { ok: true };
  });
}

const targetCellSchema = z.object({
  profileId: z.uuid(),
  weekStart: monday,
  kpiId: z.uuid(),
  target: z.number().min(0).max(100_000).nullable(),
});

/** Obiettivo di una voce scritto a mano dal foglio della persona (null = toglie l'obiettivo). */
export async function saveTargetCell(
  input: z.input<typeof targetCellSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = targetCellSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Obiettivo non valido." };
    const { profileId, weekStart, kpiId, target } = parsed.data;
    const { error } =
      target === null
        ? await supabase
            .from("weekly_targets")
            .delete()
            .eq("profile_id", profileId)
            .eq("week_start", weekStart)
            .eq("kpi_id", kpiId)
        : await supabase.from("weekly_targets").upsert(
            {
              profile_id: profileId,
              week_start: weekStart,
              kpi_id: kpiId,
              target,
              overridden: true,
            },
            { onConflict: "profile_id,week_start,kpi_id" },
          );
    if (error) throw new ActionError(dbErrorMessage(error, "Obiettivo non salvato."));
    return { ok: true };
  });
}

const commentSchema = z.object({
  profileId: z.uuid(),
  weekStart: monday,
  kpiId: z.uuid().nullable(),
  body: z.string().max(4000),
});

/**
 * Commento della settimana (per voce, o generale con kpiId null). Un commento nuovo o modificato
 * torna "da pubblicare": il dipendente lo vede dopo "Pubblica commenti".
 */
export async function saveWeekComment(input: z.input<typeof commentSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const parsed = commentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Commento troppo lungo." };
    const { profileId, weekStart, kpiId } = parsed.data;
    const body = parsed.data.body.trim();

    let query = supabase
      .from("weekly_comments")
      .select("id, body")
      .eq("profile_id", profileId)
      .eq("week_start", weekStart);
    query = kpiId ? query.eq("kpi_id", kpiId) : query.is("kpi_id", null);
    const { data: existing } = await query.maybeSingle();

    if (existing && existing.body === body) return { ok: true };
    const { error } = existing
      ? body
        ? await supabase
            .from("weekly_comments")
            .update({ body, author_id: profile.id, published: false })
            .eq("id", existing.id)
        : await supabase.from("weekly_comments").delete().eq("id", existing.id)
      : body
        ? await supabase.from("weekly_comments").insert({
            profile_id: profileId,
            week_start: weekStart,
            kpi_id: kpiId,
            body,
            author_id: profile.id,
            published: false,
          })
        : { error: null };
    if (error) throw new ActionError(dbErrorMessage(error, "Commento non salvato."));
    return { ok: true };
  });
}

const publishSchema = z.object({ profileId: z.uuid(), weekStart: monday });

/** "Pubblica commenti": li rende visibili al dipendente e lo avvisa. */
export async function publishWeekComments(
  input: z.input<typeof publishSchema>,
): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = publishSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const { profileId, weekStart } = parsed.data;
    const { data, error } = await supabase
      .from("weekly_comments")
      .update({ published: true })
      .eq("profile_id", profileId)
      .eq("week_start", weekStart)
      .eq("published", false)
      .neq("body", "")
      .select("id");
    if (error) throw new ActionError(dbErrorMessage(error, "Commenti non pubblicati."));
    const count = data?.length ?? 0;
    if (count === 0)
      return { ok: true, message: "Nessun commento nuovo da pubblicare.", data: { count } };
    await notify([profileId], {
      kind: "week_comments",
      title: `Commenti della ${weekLabel(weekStart)}`,
      body: "Il tuo responsabile ha commentato la tua settimana.",
      link: `/obiettivi?settimana=${weekStart}`,
    });
    revalidateWeek(weekStart);
    return {
      ok: true,
      message: `${count} ${count === 1 ? "commento pubblicato" : "commenti pubblicati"}.`,
      data: { count },
    };
  });
}

/* --------------------------------------------------------- monitoraggio */

const bestSchema = z.object({ weekStart: monday, profileId: z.uuid().nullable() });

/** Conferma (o annulla) il best performer della settimana, visibile a tutti. */
export async function confirmBestPerformer(
  input: z.input<typeof bestSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = bestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const { weekStart, profileId } = parsed.data;
    const { error } = await supabase.from("store_weekly_targets").upsert(
      {
        week_start: weekStart,
        best_performer_id: profileId,
        best_performer_confirmed: profileId !== null,
      },
      { onConflict: "week_start" },
    );
    if (error) throw new ActionError(dbErrorMessage(error, "Best performer non salvato."));
    revalidateWeek(weekStart);
    revalidatePath("/obiettivi");
    return {
      ok: true,
      message: profileId
        ? "Best performer confermato: lo vede tutto lo staff."
        : "Conferma annullata.",
    };
  });
}

const remindSchema = z.object({ profileIds: z.array(z.uuid()).min(1).max(100), date: isoDate });

/** "Sollecita": promemoria a chi era in turno e non ha compilato la giornata. */
export async function remindToFill(input: z.input<typeof remindSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await adminAction();
    const parsed = remindSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const day = format(parseISO(parsed.data.date), "d/M");
    await notify(parsed.data.profileIds, {
      kind: "daily_reminder",
      title: "Compila la giornata",
      body: `Mancano i tuoi numeri di ${day}: bastano 30 secondi.`,
      link: "/obiettivi",
    });
    const n = parsed.data.profileIds.length;
    return { ok: true, message: `Promemoria inviato a ${n} ${n === 1 ? "persona" : "persone"}.` };
  });
}

/* ------------------------------------------------------------------ voci */

const kpiSchema = z.object({
  id: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{0,29}$/, "Solo lettere maiuscole, numeri e _ (es. DEMO_META)."),
  label: z.string().trim().min(1, "Scrivi l'etichetta.").max(60),
  description: z.string().trim().max(300).optional(),
  rule: ruleSchema.nullable(),
  active: z.boolean().default(true),
});

export async function saveKpi(
  input: z.input<typeof kpiSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = kpiSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
      return { ok: false, message: "Controlla i campi evidenziati.", fieldErrors };
    }
    const v = parsed.data;
    const { data: all } = await supabase
      .from("kpi_definitions")
      .select("id, code, default_target_rule, sort_order");
    const rules = new Map<string, DefaultTargetRule>(
      (all ?? [])
        .filter((k) => k.id !== v.id)
        .map((k) => [k.code, parseRule(k.default_target_rule)]),
    );
    if (v.rule?.type === "pct_of") {
      if (!rules.has(v.rule.kpi) && v.rule.kpi !== v.code)
        return {
          ok: false,
          message: "La voce di riferimento non esiste.",
          fieldErrors: { rule: "Voce non trovata." },
        };
      if (v.rule.kpi === v.code || createsCycle(v.code, v.rule, rules))
        return {
          ok: false,
          message: "La percentuale non può riferirsi a sé stessa (anche indirettamente).",
          fieldErrors: { rule: "Riferimento circolare." },
        };
    }
    const row = {
      code: v.code,
      label: v.label,
      description: v.description || null,
      default_target_rule: v.rule,
      active: v.active,
    };
    if (v.id) {
      const { error } = await supabase.from("kpi_definitions").update(row).eq("id", v.id);
      if (error)
        return error.code === "23505"
          ? { ok: false, message: "Codice già usato.", fieldErrors: { code: "Codice già usato." } }
          : { ok: false, message: dbErrorMessage(error, "Voce non salvata.") };
      revalidatePath("/admin/obiettivi", "layout");
      return { ok: true, message: "Voce salvata.", data: { id: v.id } };
    }
    const sortOrder = Math.max(0, ...(all ?? []).map((k) => k.sort_order)) + 1;
    const { data, error } = await supabase
      .from("kpi_definitions")
      .insert({ ...row, sort_order: sortOrder })
      .select("id")
      .single();
    if (error)
      return error.code === "23505"
        ? { ok: false, message: "Codice già usato.", fieldErrors: { code: "Codice già usato." } }
        : { ok: false, message: dbErrorMessage(error, "Voce non creata.") };
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true, message: "Voce creata.", data: { id: data.id } };
  });
}

export async function setKpiActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("kpi_definitions")
      .update({ active })
      .eq("id", z.uuid().parse(id));
    if (error) throw new ActionError(dbErrorMessage(error, "Voce non aggiornata."));
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

/** Nuovo ordine delle voci (elenco completo degli id). */
export async function reorderKpis(ids: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const list = z.array(z.uuid()).min(1).max(200).parse(ids);
    for (const [i, id] of list.entries()) {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ sort_order: i + 1 })
        .eq("id", id);
      if (error) throw new ActionError(dbErrorMessage(error, "Ordine non salvato."));
    }
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

const groupItemSchema = z.object({
  setId: z.uuid(),
  kpiId: z.uuid(),
  labelOverride: z.string().trim().max(60).nullable().optional(),
});

/** Aggiunge una voce al gruppo (o ne cambia l'etichetta nel gruppo). */
export async function upsertGroupItem(
  input: z.input<typeof groupItemSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const v = groupItemSchema.parse(input);
    const { data: existing } = await supabase
      .from("kpi_set_items")
      .select("sort_order")
      .eq("set_id", v.setId);
    const { error } = await supabase.from("kpi_set_items").upsert(
      {
        set_id: v.setId,
        kpi_id: v.kpiId,
        label_override: v.labelOverride || null,
        sort_order: Math.max(0, ...(existing ?? []).map((e) => e.sort_order)) + 1,
      },
      { onConflict: "set_id,kpi_id", ignoreDuplicates: false },
    );
    if (error) throw new ActionError(dbErrorMessage(error, "Gruppo non aggiornato."));
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

export async function renameGroupItem(
  input: z.input<typeof groupItemSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const v = groupItemSchema.parse(input);
    const { error } = await supabase
      .from("kpi_set_items")
      .update({ label_override: v.labelOverride || null })
      .eq("set_id", v.setId)
      .eq("kpi_id", v.kpiId);
    if (error) throw new ActionError(dbErrorMessage(error, "Etichetta non salvata."));
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

export async function removeGroupItem(setId: string, kpiId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("kpi_set_items")
      .delete()
      .eq("set_id", z.uuid().parse(setId))
      .eq("kpi_id", z.uuid().parse(kpiId));
    if (error) throw new ActionError(dbErrorMessage(error, "Gruppo non aggiornato."));
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

/** Sposta una voce su o giù nel gruppo. */
export async function reorderGroup(setId: string, kpiIds: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const id = z.uuid().parse(setId);
    const list = z.array(z.uuid()).max(200).parse(kpiIds);
    for (const [i, kpiId] of list.entries()) {
      const { error } = await supabase
        .from("kpi_set_items")
        .update({ sort_order: i + 1 })
        .eq("set_id", id)
        .eq("kpi_id", kpiId);
      if (error) throw new ActionError(dbErrorMessage(error, "Ordine non salvato."));
    }
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

const personKpiSchema = z.object({
  profileId: z.uuid(),
  kpiId: z.uuid(),
  labelOverride: z.string().trim().max(60).nullable().optional(),
});

/** Voci della singola persona: aggiunge (o rinomina) una voce. */
export async function upsertPersonKpi(
  input: z.input<typeof personKpiSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const v = personKpiSchema.parse(input);
    await ensureProfileKpis(supabase, [v.profileId]);
    const { data: existing } = await supabase
      .from("profile_kpis")
      .select("kpi_id, sort_order")
      .eq("profile_id", v.profileId);
    const current = (existing ?? []).find((e) => e.kpi_id === v.kpiId);
    const { error } = await supabase.from("profile_kpis").upsert(
      {
        profile_id: v.profileId,
        kpi_id: v.kpiId,
        label_override: v.labelOverride || null,
        active: true,
        sort_order:
          current?.sort_order ?? Math.max(0, ...(existing ?? []).map((e) => e.sort_order)) + 1,
      },
      { onConflict: "profile_id,kpi_id" },
    );
    if (error) throw new ActionError(dbErrorMessage(error, "Voce non salvata."));
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

/** Toglie una voce alla persona (le voci restano come righe disattivate: lo storico non cambia). */
export async function removePersonKpi(profileId: string, kpiId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const pid = z.uuid().parse(profileId);
    await ensureProfileKpis(supabase, [pid]);
    const { error } = await supabase
      .from("profile_kpis")
      .update({ active: false })
      .eq("profile_id", pid)
      .eq("kpi_id", z.uuid().parse(kpiId));
    if (error) throw new ActionError(dbErrorMessage(error, "Voce non tolta."));
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true };
  });
}

/** "Reimposta dal gruppo della sua area": sostituisce le voci della persona con quelle del gruppo. */
export async function resetPersonKpis(profileId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const pid = z.uuid().parse(profileId);
    const { error } = await supabase.from("profile_kpis").delete().eq("profile_id", pid);
    if (error) throw new ActionError(dbErrorMessage(error, "Voci non reimpostate."));
    await ensureProfileKpis(supabase, [pid]);
    revalidatePath("/admin/obiettivi", "layout");
    return { ok: true, message: "Voci reimpostate dal gruppo della sua area." };
  });
}
