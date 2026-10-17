"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedAction, dbErrorMessage, runAction, type ActionResult } from "@/lib/auth/guards";
import { nowInRome, toISODate } from "@/lib/dates";
import { adminIds, notify } from "@/lib/notifications";
import { formatRange, requestTypeLabel, requestWarnings, type RequestType } from "@/lib/requests";
import { createAdminClient } from "@/lib/supabase/admin";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const requestSchema = z
  .object({
    type: z.enum([
      "ferie",
      "permesso",
      "cambio_turno",
      "scambio_turno",
      "giorno_libero",
      "indisponibilita",
      "malattia",
      "altro",
    ]),
    startDate: z.iso.date("Indica la data di inizio."),
    endDate: z.iso.date("Indica la data di fine."),
    startTime: time.nullable(),
    endTime: time.nullable(),
    hours: z.number().min(0.5).max(12).multipleOf(0.5).nullable(),
    recurringWeekdays: z.array(z.number().int().min(1).max(7)).max(7).nullable(),
    shiftId: z.uuid().nullable(),
    targetProfileId: z.uuid().nullable(),
    targetShiftId: z.uuid().nullable(),
    targetDate: z.iso.date().nullable(),
    message: z.string().trim().max(2000),
    attachmentPath: z.string().max(300).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "La fine deve seguire l'inizio.",
      });
    if (v.type === "scambio_turno" && !v.targetProfileId) {
      ctx.addIssue({ code: "custom", path: ["targetProfileId"], message: "Scegli il collega." });
    }
    if (v.type === "indisponibilita" && !v.recurringWeekdays?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["recurringWeekdays"],
        message: "Scegli almeno un giorno della settimana.",
      });
    }
    if (v.startTime && v.endTime && v.endTime <= v.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "L'orario di fine deve seguire l'inizio.",
      });
    }
    if ((v.type === "cambio_turno" || v.type === "altro") && v.message.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["message"],
        message: "Spiega brevemente cosa ti serve.",
      });
    }
  });

export type RequestInput = z.input<typeof requestSchema>;

/** Avvisi non bloccanti, calcolati mentre si compila la richiesta. */
export async function checkRequest(input: {
  type: RequestType;
  startDate: string;
  endDate: string;
}): Promise<ActionResult<string[]>> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    if (!input.startDate || !input.endDate || input.endDate < input.startDate)
      return { ok: true, data: [] };
    const [
      { data: settings },
      { data: mine },
      { data: myDeps },
      { data: away },
      { data: profiles },
    ] = await Promise.all([
      supabase.from("store_settings").select("request_notice_days").eq("id", true).single(),
      supabase
        .from("requests")
        .select("id, type, start_date, end_date, status")
        .eq("profile_id", profile.id)
        .in("status", ["pending", "peer_accepted", "approved"]),
      supabase.from("profile_departments").select("department_id").eq("profile_id", profile.id),
      supabase
        .from("leaves_public")
        .select("profile_id, date")
        .gte("date", input.startDate)
        .lte("date", input.endDate),
      supabase.from("public_profiles").select("id, department_ids"),
    ]);
    const deps = new Set((myDeps ?? []).map((d) => d.department_id));
    const sameDept = new Set(
      (profiles ?? [])
        .filter((p) => p.id !== profile.id && (p.department_ids ?? []).some((d) => deps.has(d)))
        .map((p) => p.id),
    );
    const byDate: Record<string, number> = {};
    for (const l of away ?? [])
      if (sameDept.has(l.profile_id!)) byDate[l.date!] = (byDate[l.date!] ?? 0) + 1;

    return {
      ok: true,
      data: requestWarnings({
        today: toISODate(nowInRome()),
        startDate: input.startDate,
        endDate: input.endDate,
        noticeDays: settings?.request_notice_days ?? 7,
        type: input.type,
        myOpenRequests: (mine ?? []).map((r) => ({
          type: r.type,
          startDate: r.start_date,
          endDate: r.end_date,
        })),
        colleaguesAwayByDate: byDate,
      }),
    };
  });
}

export async function createRequest(input: RequestInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const v = parsed.data;
    if (v.targetProfileId === profile.id)
      return { ok: false, message: "Scegli un collega diverso da te." };
    if (v.attachmentPath && !v.attachmentPath.startsWith(`${profile.id}/`)) {
      return { ok: false, message: "Allegato non valido." };
    }

    const { data, error } = await supabase
      .from("requests")
      .insert({
        profile_id: profile.id,
        type: v.type,
        start_date: v.startDate,
        end_date: v.endDate,
        start_time: v.startTime,
        end_time: v.endTime,
        hours: v.type === "permesso" ? v.hours : null,
        recurring_weekdays: v.type === "indisponibilita" ? v.recurringWeekdays : null,
        shift_id: v.shiftId,
        target_profile_id: v.type === "scambio_turno" ? v.targetProfileId : null,
        target_shift_id: v.type === "scambio_turno" ? v.targetShiftId : null,
        target_date: v.type === "scambio_turno" ? v.targetDate : null,
        message: v.message || null,
        attachment_path: v.attachmentPath,
      })
      .select("id")
      .single();
    if (error || !data)
      return { ok: false, message: dbErrorMessage(error, "Richiesta non inviata.") };

    const what = `${requestTypeLabel(v.type)} · ${formatRange(v.startDate, v.endDate)}`;
    if (v.type === "scambio_turno") {
      await notify([v.targetProfileId!], {
        kind: "swap_proposed",
        title: `${profile.display_name} ti propone uno scambio`,
        body: what,
        link: `/richieste/${data.id}`,
      });
    } else {
      await notify(await adminIds(), {
        kind: "request_new",
        title: `Nuova richiesta di ${profile.display_name}`,
        body: what,
        link: `/admin/richieste/${data.id}`,
      });
    }
    revalidatePath("/richieste");
    revalidatePath("/admin/richieste");
    return { ok: true, message: "Richiesta inviata.", data: { id: data.id } };
  });
}

export async function cancelRequest(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await authedAction();
    const { error } = await supabase.rpc("cancel_request", { p_request_id: z.uuid().parse(id) });
    if (error) return { ok: false, message: "La richiesta non si può più annullare." };
    revalidatePath("/richieste");
    revalidatePath("/admin/richieste");
    return { ok: true, message: "Richiesta annullata." };
  });
}

export async function respondToSwap(id: string, accept: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    const { error } = await supabase.rpc("respond_to_swap", {
      p_request_id: z.uuid().parse(id),
      p_accept: accept,
    });
    if (error) return { ok: false, message: "Questo scambio non è più disponibile." };
    const { data: r } = await supabase
      .from("requests")
      .select("profile_id, start_date, end_date")
      .eq("id", id)
      .single();
    if (r) {
      await notify([r.profile_id], {
        kind: "request_decided",
        title: accept
          ? `${profile.display_name} ha accettato lo scambio`
          : `${profile.display_name} ha rifiutato lo scambio`,
        body: accept ? "Ora serve l'approvazione di un responsabile." : undefined,
        link: `/richieste/${id}`,
      });
      if (accept) {
        await notify(await adminIds(), {
          kind: "request_new",
          title: "Scambio turno da approvare",
          body: formatRange(r.start_date, r.end_date),
          link: `/admin/richieste/${id}`,
        });
      }
    }
    revalidatePath("/richieste");
    revalidatePath("/admin/richieste");
    return { ok: true, message: accept ? "Scambio accettato." : "Scambio rifiutato." };
  });
}

export async function addRequestComment(requestId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    const text = z.string().trim().min(1, "Scrivi un commento.").max(4000).parse(body);
    const id = z.uuid().parse(requestId);
    const { data: r } = await supabase
      .from("requests")
      .select("profile_id, target_profile_id")
      .eq("id", id)
      .single();
    if (!r) return { ok: false, message: "Richiesta non trovata." };
    const { error } = await supabase
      .from("request_comments")
      .insert({ request_id: id, author_id: profile.id, body: text });
    if (error) return { ok: false, message: dbErrorMessage(error, "Commento non salvato.") };

    const recipients =
      profile.role === "admin" && r.profile_id !== profile.id
        ? [r.profile_id]
        : (await adminIds()).filter((a) => a !== profile.id);
    await notify(recipients, {
      kind: "request_decided",
      title: `Nuovo commento di ${profile.display_name}`,
      body: text.slice(0, 140),
      link:
        profile.role === "admin" && r.profile_id !== profile.id
          ? `/richieste/${id}`
          : `/admin/richieste/${id}`,
    });
    revalidatePath(`/richieste/${id}`);
    revalidatePath(`/admin/richieste/${id}`);
    return { ok: true };
  });
}

/** Carica un allegato in attachments/<uid>/… (se lo Storage è disponibile). */
export async function uploadRequestAttachment(
  formData: FormData,
): Promise<ActionResult<{ path: string; name: string }>> {
  return runAction(async () => {
    const { profile } = await authedAction();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, message: "Scegli un file." };
    if (file.size > 10 * 1024 * 1024)
      return { ok: false, message: "L'allegato deve pesare meno di 10 MB." };
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"];
    if (!allowed.includes(file.type))
      return { ok: false, message: "Formati ammessi: PDF, JPG, PNG, HEIC, WebP." };
    const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${profile.id}/${crypto.randomUUID()}-${safe}`;
    // Upload con la service role nella cartella dell'utente: lo Storage resta privato.
    const { error } = await createAdminClient()
      .storage.from("attachments")
      .upload(path, file, { contentType: file.type });
    if (error) return { ok: false, message: "Allegati non disponibili in questo momento." };
    return { ok: true, data: { path, name: file.name } };
  });
}
