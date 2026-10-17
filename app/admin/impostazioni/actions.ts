"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  adminAction,
  dbErrorMessage,
  runAction,
  zodFieldErrors,
  type ActionResult,
} from "@/lib/auth/guards";
import { italianHolidays } from "@/lib/holidays";
import { openingHoursSchema, shiftTemplateSchema, type OpeningHoursMap } from "@/lib/settings";

const done = (message: string): ActionResult => {
  revalidatePath("/admin/impostazioni", "layout");
  return { ok: true, message };
};

export async function saveStoreSettings(input: {
  storeName: string;
  requestNoticeDays: number;
  shareIndividualMonitoring: boolean;
  leaveThresholds: Record<string, number | null>;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = z
      .object({
        storeName: z.string().trim().min(2).max(80),
        requestNoticeDays: z.coerce.number().int().min(0).max(90),
        shareIndividualMonitoring: z.boolean(),
        leaveThresholds: z.record(z.uuid(), z.number().int().min(1).max(50).nullable()),
      })
      .safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Controlla i valori.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    const thresholds = Object.fromEntries(
      Object.entries(v.leaveThresholds).filter(([, n]) => n != null),
    );
    const { error } = await supabase
      .from("store_settings")
      .update({
        store_name: v.storeName,
        request_notice_days: v.requestNoticeDays,
        share_individual_monitoring: v.shareIndividualMonitoring,
        leave_thresholds: thresholds,
      })
      .eq("id", true);
    if (error) return { ok: false, message: dbErrorMessage(error, "Impostazioni non salvate.") };
    return done("Impostazioni salvate.");
  });
}

export async function saveOpeningHours(hours: OpeningHoursMap): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = openingHoursSchema.safeParse(hours);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Controlla gli orari.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const { error } = await supabase
      .from("store_settings")
      .update({ opening_hours: parsed.data })
      .eq("id", true);
    if (error) return { ok: false, message: dbErrorMessage(error, "Orari non salvati.") };
    return done("Orari di apertura salvati.");
  });
}

const exceptionSchema = z
  .object({
    date: z.iso.date("Data non valida."),
    closed: z.boolean(),
    openTime: z.string().nullable(),
    closeTime: z.string().nullable(),
    note: z.string().trim().max(120).nullable(),
  })
  .refine((v) => v.closed || (v.openTime && v.closeTime && v.closeTime > v.openTime), {
    message: "Indica apertura e chiusura, oppure segna il giorno come chiuso.",
    path: ["openTime"],
  });

export async function upsertOpeningException(
  input: z.input<typeof exceptionSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = exceptionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const v = parsed.data;
    const { error } = await supabase.from("opening_exceptions").upsert(
      {
        date: v.date,
        open_time: v.closed ? null : v.openTime,
        close_time: v.closed ? null : v.closeTime,
        note: v.note || null,
      },
      { onConflict: "date" },
    );
    if (error) return { ok: false, message: dbErrorMessage(error, "Eccezione non salvata.") };
    return done("Eccezione salvata.");
  });
}

export async function deleteOpeningException(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("opening_exceptions")
      .delete()
      .eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: dbErrorMessage(error, "Eccezione non eliminata.") };
    return done("Eccezione eliminata.");
  });
}

export async function saveShiftTemplate(
  id: string | null,
  input: z.input<typeof shiftTemplateSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = shiftTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0].message,
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    const row = {
      code: v.code,
      label: v.label,
      is_absence: v.isAbsence,
      start_time: v.isAbsence ? null : v.startTime,
      end_time: v.isAbsence ? null : v.endTime,
      break_minutes: v.isAbsence ? 0 : v.breakMinutes,
      sort_order: v.sortOrder,
    };
    const { error } = id
      ? await supabase.from("shift_templates").update(row).eq("id", id)
      : await supabase.from("shift_templates").insert(row);
    if (error) {
      return {
        ok: false,
        message:
          error.code === "23505"
            ? `Il codice ${v.code} esiste già.`
            : dbErrorMessage(error, "Turno non salvato."),
      };
    }
    return done(id ? "Turno rapido aggiornato." : "Turno rapido creato.");
  });
}

export async function deleteShiftTemplate(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const templateId = z.uuid().parse(id);
    // Un turno rapido usato nei turni non si può eliminare (i turni di assenza non avrebbero
    // più né orario né codice): prima va sostituito nel foglio turni.
    const { count } = await supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId);
    if (count) {
      return {
        ok: false,
        message: `Questo turno rapido è usato in ${count} ${count === 1 ? "turno" : "turni"}: sostituiscilo nel foglio turni prima di eliminarlo.`,
      };
    }
    const { error } = await supabase.from("shift_templates").delete().eq("id", templateId);
    if (error) return { ok: false, message: dbErrorMessage(error, "Turno non eliminato.") };
    return done("Turno rapido eliminato.");
  });
}

export async function saveHoliday(input: {
  id?: string;
  date: string;
  label: string;
  storeClosed: boolean;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const parsed = z
      .object({
        id: z.uuid().optional(),
        date: z.iso.date("Data non valida."),
        label: z.string().trim().min(2, "Inserisci il nome.").max(60),
        storeClosed: z.boolean(),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const v = parsed.data;
    const row = { date: v.date, label: v.label, store_closed: v.storeClosed };
    const { error } = v.id
      ? await supabase.from("holidays").update(row).eq("id", v.id)
      : await supabase.from("holidays").insert(row);
    if (error?.code === "23505")
      return { ok: false, message: "Esiste già una festività in quella data: modifica quella." };
    if (error) return { ok: false, message: dbErrorMessage(error, "Festività non salvata.") };
    return done("Festività salvata.");
  });
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase.from("holidays").delete().eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: dbErrorMessage(error, "Festività non eliminata.") };
    return done("Festività eliminata.");
  });
}

/** Aggiunge le festività nazionali di un anno (senza toccare quelle già presenti). */
export async function addNationalHolidays(year: number): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const y = z.number().int().min(2020).max(2100).parse(year);
    const { error } = await supabase
      .from("holidays")
      .upsert(italianHolidays(y), { onConflict: "date", ignoreDuplicates: true });
    if (error) return { ok: false, message: dbErrorMessage(error, "Festività non aggiunte.") };
    return done(`Festività ${y} aggiunte.`);
  });
}

export async function uploadLogo(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, message: "Scegli un file." };
    if (file.size > 2 * 1024 * 1024)
      return { ok: false, message: "Il logo deve pesare meno di 2 MB." };
    if (!["image/png", "image/svg+xml", "image/jpeg", "image/webp"].includes(file.type)) {
      return { ok: false, message: "Formati ammessi: PNG, SVG, JPG, WebP." };
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upError } = await supabase.storage
      .from("branding")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upError) return { ok: false, message: "Caricamento non riuscito." };
    const { error } = await supabase
      .from("store_settings")
      .update({ logo_path: path })
      .eq("id", true);
    if (error) return { ok: false, message: dbErrorMessage(error, "Logo non salvato.") };
    return done("Logo aggiornato.");
  });
}

export async function removeLogo(): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { error } = await supabase
      .from("store_settings")
      .update({ logo_path: null })
      .eq("id", true);
    if (error) return { ok: false, message: dbErrorMessage(error, "Logo non rimosso.") };
    return done("Logo rimosso: si usa il wordmark testuale.");
  });
}
