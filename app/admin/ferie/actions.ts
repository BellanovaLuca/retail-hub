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
import { chunk, fetchAllRows } from "@/lib/data/paginate";
import { formatLeaveCell } from "@/lib/leaves/parse";
import { cellsToWrites, dateRange, type LeaveWrite } from "@/lib/leaves/plan";
import { removeLeaveRows, type LeaveRow } from "@/lib/leaves/removal";
import { REVOKED_FROM_LEAVES_NOTE } from "@/lib/requests";
import type { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/types";

type Db = Awaited<ReturnType<typeof createClient>>;

const isoDate = z.iso.date("Data non valida.");
const uuid = z.uuid("Persona non valida.");

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

export type SaveLeavesResult = {
  saved: number;
  skippedRequests: number;
  errors: number;
  /** Richieste approvate rimaste senza giorni dopo una rimozione: riportate a "rifiutata". */
  revokedRequests?: number;
  /** Dipendenti avvisati perché è stata tolta un'assenza nata da una loro richiesta. */
  notices?: number;
};

/** Ferie, ma anche turni (segnale di conflitto), richieste (revoche) e orari dei dipendenti. */
function revalidateLeaves() {
  revalidatePath("/admin/ferie", "layout");
  revalidatePath("/admin/turni", "layout");
  revalidatePath("/admin/richieste", "layout");
  revalidatePath("/ferie");
  revalidatePath("/richieste", "layout");
  revalidatePath("/orari", "layout");
  revalidatePath("/admin");
  revalidatePath("/");
}

const cellKey = (profileId: string, date: string) => `${profileId}|${date}`;

/**
 * Assenze già presenti nelle celle che si stanno scrivendo. Lettura a pagine: su un periodo lungo
 * per più persone le righe superano le 1000, e una riga non vista verrebbe sovrascritta senza
 * accorgersi che nasce da una richiesta approvata.
 */
async function existingLeaves(db: Db, writes: LeaveWrite[]): Promise<Map<string, LeaveRow>> {
  const out = new Map<string, LeaveRow>();
  const profiles = [...new Set(writes.map((w) => w.profileId))];
  if (profiles.length === 0) return out;
  const dates = writes.map((w) => w.date).sort();
  const wanted = new Set(writes.map((w) => cellKey(w.profileId, w.date)));
  try {
    // A blocchi: gli id viaggiano nell'indirizzo della richiesta.
    for (const ids of chunk(profiles, 50)) {
      const rows = await fetchAllRows<LeaveRow>((from, to) =>
        db
          .from("leaves")
          .select("profile_id, date, type, hours, status, source, request_id", { count: "exact" })
          .in("profile_id", ids)
          .gte("date", dates[0])
          .lte("date", dates.at(-1)!)
          .order("date")
          .order("profile_id")
          .range(from, to),
      );
      for (const l of rows) {
        const k = cellKey(l.profile_id, l.date);
        if (wanted.has(k)) out.set(k, l);
      }
    }
  } catch (error) {
    throw new ActionError(
      dbErrorMessage(error as { code?: string } | null, "Planning non disponibile."),
    );
  }
  return out;
}

/**
 * Scritture a lotti su `leaves`: upsert e cancellazioni, con `source = 'planning'`.
 *
 * Come nel foglio turni, togliere un'assenza nata da una richiesta approvata (solo con conferma
 * esplicita) avvisa il dipendente, e una richiesta rimasta senza nessun giorno torna "rifiutata".
 * Il segnale di conflitto dei turni segue le assenze a giornata intera: si accende dove ne
 * compare una sopra un turno, si spegne dove sparisce (o diventa un permesso di poche ore).
 */
async function applyWrites(
  db: Db,
  actorId: string,
  writes: LeaveWrite[],
  overrideRequests: boolean,
): Promise<Omit<SaveLeavesResult, "errors">> {
  const existing = await existingLeaves(db, writes);
  const before = (w: LeaveWrite) => existing.get(cellKey(w.profileId, w.date));
  const allowed = writes.filter((w) => overrideRequests || before(w)?.source !== "request");
  const skippedRequests = writes.length - allowed.length;

  const upsertWrites = allowed.filter((w) => w.kind === "upsert");
  const upserts: TablesInsert<"leaves">[] = upsertWrites.map((w) => ({
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

  // Conflitto con i turni: solo nelle giornate in cui cambia la presenza di un'assenza a giornata
  // intera (riscrivere la stessa F non riaccende un conflitto che l'admin aveva già risolto).
  const conflictDays = upsertWrites
    .filter((w) => {
      const old = before(w);
      return (old !== undefined && old.hours == null) !== (w.hours == null);
    })
    .map((w) => ({ profile_id: w.profileId, date: w.date }));
  for (const part of chunk(conflictDays, 1000)) {
    const { error } = await db.rpc("refresh_shift_conflicts", { p_days: part });
    if (error) {
      throw new ActionError(
        dbErrorMessage(
          error,
          "Ferie salvate, ma il segnale di conflitto dei turni non è stato aggiornato: riprova.",
        ),
      );
    }
  }

  // Cancellazioni: solo le assenze che ci sono davvero, con la stessa procedura del foglio turni.
  const targets = allowed.flatMap((w) => {
    const old = before(w);
    return w.kind === "delete" && old ? [old] : [];
  });
  const removal = await removeLeaveRows(db, actorId, targets, {
    note: REVOKED_FROM_LEAVES_NOTE,
    title: "Assenza tolta dal planning ferie",
  });

  return {
    saved: allowed.length,
    skippedRequests,
    revokedRequests: removal.revokedRequests,
    notices: removal.notices,
  };
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
  if (r.revokedRequests) {
    parts.push(
      r.revokedRequests === 1
        ? "1 richiesta rimasta senza giorni: ora risulta rifiutata"
        : `${r.revokedRequests} richieste rimaste senza giorni: ora risultano rifiutate`,
    );
  }
  if (r.notices) parts.push(r.notices === 1 ? "dipendente avvisato" : "dipendenti avvisati");
  return parts.length ? `Salvato. ${parts.join(" · ")}.` : "Salvato.";
}

/** Salvataggio a lotti dal foglio "Persone × giorni" (testo delle celle: F, F?, PE4, MA…). */
export async function saveLeaveCells(input: unknown): Promise<ActionResult<SaveLeavesResult>> {
  return runAction(async () => {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Modifiche non valide." };
    const { supabase, profile } = await adminAction();
    const { writes, errors } = cellsToWrites(parsed.data.changes);
    const res = await applyWrites(supabase, profile.id, writes, parsed.data.overrideRequests);
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
    type: z.enum(["ferie", "permesso", "malattia", "altro"], "Tipo di assenza non valido."),
    status: z.enum(["confirmed", "tentative"], "Stato non valido."),
    hours: z
      .number("Indica le ore (es. 4 o 4,5).")
      .min(0.5, "Indica le ore (es. 4 o 4,5).")
      .max(12, "Massimo 12 ore.")
      .multipleOf(0.5, "A mezz'ore.")
      .nullable()
      .default(null),
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
    const { supabase, profile } = await adminAction();
    const code = formatLeaveCell({
      type: v.type,
      status: v.status,
      hours: v.type === "permesso" ? v.hours : null,
    });
    const days = dateRange(v.from, v.to);
    const { writes } = cellsToWrites(
      v.profileIds.flatMap((profileId) => days.map((date) => ({ profileId, date, value: code }))),
    );
    const res = await applyWrites(supabase, profile.id, writes, v.overrideRequests);
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
    const { supabase, profile } = await adminAction();
    const days = dateRange(v.from, v.to);
    const writes: LeaveWrite[] = v.profileIds.flatMap((profileId) =>
      days.map((date) => ({ kind: "delete" as const, profileId, date })),
    );
    const res = await applyWrites(supabase, profile.id, writes, v.overrideRequests);
    revalidateLeaves();
    const data = { ...res, errors: 0 };
    return { ok: true, message: summary(data), data };
  });
}

// Stessi limiti del form Impostazioni → Negozio (saveStoreSettings): 0–50, vuoto = nessuna soglia.
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
