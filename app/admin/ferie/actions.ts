"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  adminAction,
  dbErrorMessage,
  runAction,
  zodFieldErrors,
  type ActionResult,
} from "@/lib/auth/guards";
import { formatLeaveCell } from "@/lib/leaves/parse";
import { cellsToWrites, dateRange, type LeaveWrite } from "@/lib/leaves/plan";
import type { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/types";

type Db = Awaited<ReturnType<typeof createClient>>;

const isoDate = z.iso.date();
const uuid = z.uuid();

const cellSchema = z.object({
  profileId: uuid,
  date: isoDate,
  value: z.string().max(16),
});

const saveSchema = z.object({
  changes: z.array(cellSchema).min(1).max(8000),
  /** Le assenze nate da una richiesta approvata si toccano solo con conferma esplicita. */
  overrideRequests: z.boolean().default(false),
});

export type SaveLeavesResult = { saved: number; skippedRequests: number; errors: number };

function revalidateLeaves() {
  revalidatePath("/admin/ferie", "layout");
  revalidatePath("/ferie");
  revalidatePath("/admin");
  revalidatePath("/");
}

/** Celle con un'assenza nata da una richiesta approvata, tra quelle che si stanno scrivendo. */
async function requestCells(db: Db, writes: LeaveWrite[]) {
  const profiles = [...new Set(writes.map((w) => w.profileId))];
  const dates = writes.map((w) => w.date).sort();
  if (profiles.length === 0) return new Set<string>();
  const { data, error } = await db
    .from("leaves")
    .select("profile_id, date")
    .eq("source", "request")
    .in("profile_id", profiles)
    .gte("date", dates[0])
    .lte("date", dates.at(-1)!);
  if (error) throw new ActionError(dbErrorMessage(error, "Planning non disponibile."));
  return new Set((data ?? []).map((l) => `${l.profile_id}|${l.date}`));
}

/** Scritture a lotti su `leaves`: upsert e cancellazioni, con `source = 'planning'`. */
async function applyWrites(
  db: Db,
  writes: LeaveWrite[],
  overrideRequests: boolean,
): Promise<{ saved: number; skippedRequests: number }> {
  const fromRequest = await requestCells(db, writes);
  const allowed = writes.filter(
    (w) => overrideRequests || !fromRequest.has(`${w.profileId}|${w.date}`),
  );
  const skippedRequests = writes.length - allowed.length;

  const upserts: TablesInsert<"leaves">[] = allowed
    .filter((w) => w.kind === "upsert")
    .map((w) => ({
      profile_id: w.profileId,
      date: w.date,
      type: w.type,
      status: w.status,
      hours: w.hours,
      // request_id non si tocca: se l'admin modifica un'assenza nata da una richiesta resta il
      // collegamento (e l'annullamento della richiesta continua a toglierla).
      source: "planning" as const,
    }));
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await db
      .from("leaves")
      .upsert(upserts.slice(i, i + 500), { onConflict: "profile_id,date" });
    if (error) throw new ActionError(dbErrorMessage(error, "Ferie non salvate."));
  }

  const deletesByProfile = new Map<string, string[]>();
  for (const w of allowed) {
    if (w.kind !== "delete") continue;
    deletesByProfile.set(w.profileId, [...(deletesByProfile.get(w.profileId) ?? []), w.date]);
  }
  for (const [profileId, dates] of deletesByProfile) {
    for (let i = 0; i < dates.length; i += 300) {
      let query = db
        .from("leaves")
        .delete()
        .eq("profile_id", profileId)
        .in("date", dates.slice(i, i + 300));
      if (!overrideRequests) query = query.neq("source", "request");
      const { error } = await query;
      if (error) throw new ActionError(dbErrorMessage(error, "Ferie non salvate."));
    }
  }
  return { saved: allowed.length, skippedRequests };
}

function summary(r: SaveLeavesResult) {
  const parts: string[] = [];
  if (r.skippedRequests) {
    parts.push(
      `${r.skippedRequests} ${r.skippedRequests === 1 ? "giorno nato" : "giorni nati"} da richieste approvate non ${r.skippedRequests === 1 ? "modificato" : "modificati"}`,
    );
  }
  if (r.errors)
    parts.push(`${r.errors} ${r.errors === 1 ? "cella non valida" : "celle non valide"}`);
  return parts.length ? `Salvato. ${parts.join(" · ")}.` : "Salvato.";
}

/** Salvataggio a lotti dal foglio "Persone × giorni" (testo delle celle: F, F?, PE4, MA…). */
export async function saveLeaveCells(input: unknown): Promise<ActionResult<SaveLeavesResult>> {
  return runAction(async () => {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Modifiche non valide." };
    const { supabase } = await adminAction();
    const { writes, errors } = cellsToWrites(parsed.data.changes);
    const res = await applyWrites(supabase, writes, parsed.data.overrideRequests);
    revalidateLeaves();
    const data = { ...res, errors: errors.length };
    return { ok: true, message: summary(data), data };
  });
}

const rangeSchema = z
  .object({
    profileIds: z.array(uuid).min(1, "Scegli almeno una persona.").max(100),
    from: isoDate,
    to: isoDate,
    type: z.enum(["ferie", "permesso", "malattia", "altro"]),
    status: z.enum(["confirmed", "tentative"]),
    hours: z.number().min(0.5).max(24).multipleOf(0.5).nullable().default(null),
    overrideRequests: z.boolean().default(false),
  })
  .refine((v) => dateRange(v.from, v.to).length <= 366, {
    message: "Periodo troppo lungo.",
    path: ["to"],
  });

/** Applica lo stesso tipo di assenza a una o più persone su tutto il periodo (vista calendario). */
export async function applyLeaveRange(input: unknown): Promise<ActionResult<SaveLeavesResult>> {
  return runAction(async () => {
    const parsed = rangeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Dati non validi.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    const { supabase } = await adminAction();
    const code = formatLeaveCell({
      type: v.type,
      status: v.status,
      hours: v.type === "permesso" ? v.hours : null,
    });
    const days = dateRange(v.from, v.to);
    const { writes } = cellsToWrites(
      v.profileIds.flatMap((profileId) => days.map((date) => ({ profileId, date, value: code }))),
    );
    const res = await applyWrites(supabase, writes, v.overrideRequests);
    revalidateLeaves();
    const data = { ...res, errors: 0 };
    return { ok: true, message: summary(data), data };
  });
}

const removeSchema = z.object({
  profileIds: z.array(uuid).min(1).max(100),
  from: isoDate,
  to: isoDate,
  overrideRequests: z.boolean().default(false),
});

/** Toglie le assenze di una o più persone nel periodo. */
export async function removeLeaveRange(input: unknown): Promise<ActionResult<SaveLeavesResult>> {
  return runAction(async () => {
    const parsed = removeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    const v = parsed.data;
    const { supabase } = await adminAction();
    const days = dateRange(v.from, v.to);
    const writes: LeaveWrite[] = v.profileIds.flatMap((profileId) =>
      days.map((date) => ({ kind: "delete" as const, profileId, date })),
    );
    const res = await applyWrites(supabase, writes, v.overrideRequests);
    revalidateLeaves();
    const data = { ...res, errors: 0 };
    return { ok: true, message: summary(data), data };
  });
}

const thresholdsSchema = z.record(z.uuid(), z.number().int().min(0).max(50).nullable());

/** Soglie per reparto: massimo di persone in ferie nello stesso giorno (vuoto = nessuna). */
export async function saveLeaveThresholds(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = thresholdsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Soglie non valide." };
    const { supabase } = await adminAction();
    const clean = Object.fromEntries(
      Object.entries(parsed.data).filter((e): e is [string, number] => e[1] != null),
    );
    const { error } = await supabase
      .from("store_settings")
      .update({ leave_thresholds: clean })
      .eq("id", true);
    if (error) throw new ActionError(dbErrorMessage(error, "Soglie non salvate."));
    revalidateLeaves();
    return { ok: true, message: "Soglie salvate." };
  });
}
