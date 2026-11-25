"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedAction, dbErrorMessage, runAction, type ActionResult } from "@/lib/auth/guards";
import { nowInRome, toISODate } from "@/lib/dates";
import { adminIds, notify } from "@/lib/notifications";
import {
  attachmentError,
  formatRange,
  requestTypeLabel,
  requestWarnings,
  resolveShiftRequest,
  type RequestType,
} from "@/lib/requests";
import { createAdminClient } from "@/lib/supabase/admin";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido (es. 10:30).");
const isoDate = z.iso.date();

/** Cambio e scambio partono da un turno pubblicato: il giorno è quello del turno. */
const isShiftBased = (type: string): type is "cambio_turno" | "scambio_turno" =>
  type === "cambio_turno" || type === "scambio_turno";

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
    // Per cambio e scambio le date si ricavano sul server dal turno scelto: qui si controllano
    // solo per gli altri tipi (vedi superRefine).
    startDate: z.string().max(10),
    endDate: z.string().max(10),
    startTime: time.nullable(),
    endTime: time.nullable(),
    hours: z
      .number("Indica le ore (es. 4 o 4,5).")
      .min(0.5, "Indica le ore (es. 4 o 4,5).")
      .max(12, "Massimo 12 ore.")
      .multipleOf(0.5, "A mezz'ore.")
      .nullable(),
    recurringWeekdays: z
      .array(
        z.number().int().min(1).max(7, "Giorno della settimana non valido."),
        "Scegli i giorni della settimana.",
      )
      .max(7, "Scegli i giorni della settimana.")
      .nullable(),
    shiftId: z.uuid("Scegli un turno.").nullable(),
    targetProfileId: z.uuid("Scegli il collega.").nullable(),
    targetShiftId: z.uuid("Scegli il turno del collega.").nullable(),
    // Ignorata: il giorno del turno del collega si ricava da `targetShiftId`.
    targetDate: z.string().max(10).nullable().optional(),
    message: z.string().trim().max(2000, "Il messaggio può avere al massimo 2000 caratteri."),
    attachmentPath: z.string().max(300, "Allegato non valido.").nullable(),
  })
  .superRefine((v, ctx) => {
    if (isShiftBased(v.type)) {
      if (!v.shiftId)
        ctx.addIssue({ code: "custom", path: ["shiftId"], message: "Scegli un turno." });
    } else {
      const startOk = isoDate.safeParse(v.startDate).success;
      const endOk = isoDate.safeParse(v.endDate).success;
      if (!startOk)
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: "Indica la data di inizio.",
        });
      if (!endOk)
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "Indica la data di fine." });
      if (startOk && endOk && v.endDate < v.startDate)
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "La fine deve seguire l'inizio.",
        });
    }
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
      { data: myLeaves },
    ] = await Promise.all([
      supabase.from("store_settings").select("request_notice_days").eq("id", true).single(),
      supabase
        .from("requests")
        .select("id, type, start_date, end_date, status")
        .eq("profile_id", profile.id)
        .in("status", ["pending", "peer_accepted", "approved"]),
      supabase.from("profile_departments").select("department_id").eq("profile_id", profile.id),
      // Solo ferie confermate: permessi, malattie e "da confermare" non contano come colleghi
      // in ferie.
      supabase
        .from("leaves_public")
        .select("profile_id, date")
        .eq("kind", "ferie")
        .eq("status", "confirmed")
        .is("hours", null)
        .gte("date", input.startDate)
        .lte("date", input.endDate),
      supabase.from("public_profiles").select("id, department_ids"),
      // Le proprie assenze a planning (anche inserite dall'admin): la propria riga è leggibile.
      supabase
        .from("leaves")
        .select("date, type, status, source, request_id")
        .eq("profile_id", profile.id)
        .gte("date", input.startDate)
        .lte("date", input.endDate)
        .order("date"),
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
        myPlannedLeaves: (myLeaves ?? []).map((l) => ({
          date: l.date,
          type: l.type,
          status: l.status,
          fromRequest: l.source === "request" || Boolean(l.request_id),
        })),
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
    // Solo file della propria cartella, senza risalite («..») né segmenti vuoti.
    if (
      v.attachmentPath &&
      (!v.attachmentPath.startsWith(`${profile.id}/`) ||
        v.attachmentPath.split("/").some((part) => part === "" || part === "." || part === ".."))
    ) {
      return { ok: false, message: "Allegato non valido." };
    }

    // Cambio e scambio: i giorni NON sono quelli inviati dal browser ma quelli dei turni
    // pubblicati scelti, dopo aver verificato di chi sono (il mio è mio, l'altro è del collega).
    let startDate = v.startDate;
    let endDate = v.endDate;
    let targetDate: string | null = null;
    if (isShiftBased(v.type)) {
      const ids = [v.shiftId, v.type === "scambio_turno" ? v.targetShiftId : null].filter(
        (id): id is string => Boolean(id),
      );
      const { data: found, error: shiftsError } = await supabase
        .from("published_shifts")
        .select("id, profile_id, date, start_time, is_absence")
        .in("id", ids);
      if (shiftsError) {
        return { ok: false, message: "Turni non disponibili in questo momento. Riprova." };
      }
      const resolved = resolveShiftRequest({
        type: v.type,
        me: profile.id,
        shiftId: v.shiftId,
        targetProfileId: v.targetProfileId,
        targetShiftId: v.type === "scambio_turno" ? v.targetShiftId : null,
        shifts: (found ?? []).flatMap((s) =>
          s.id && s.profile_id && s.date
            ? [
                {
                  id: s.id,
                  profileId: s.profile_id,
                  date: s.date,
                  startTime: s.start_time,
                  isAbsence: s.is_absence ?? false,
                },
              ]
            : [],
        ),
      });
      if (!resolved.ok) return { ok: false, message: resolved.message };
      startDate = resolved.startDate;
      endDate = resolved.startDate;
      targetDate = resolved.targetDate;
    }

    const { data, error } = await supabase
      .from("requests")
      .insert({
        profile_id: profile.id,
        type: v.type,
        start_date: startDate,
        end_date: endDate,
        start_time: v.startTime,
        end_time: v.endTime,
        hours: v.type === "permesso" ? v.hours : null,
        recurring_weekdays: v.type === "indisponibilita" ? v.recurringWeekdays : null,
        // Gli id dei turni non si salvano: quelli dell'istantanea pubblicata possono non esistere
        // più nella tabella di lavoro (l'admin riscrive le giornate) e violerebbero la chiave
        // esterna. Il turno è identificato da persona + giorno, come nel trigger dello scambio.
        shift_id: null,
        target_profile_id: v.type === "scambio_turno" ? v.targetProfileId : null,
        target_shift_id: null,
        target_date: targetDate,
        message: v.message || null,
        attachment_path: v.attachmentPath,
      })
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        message:
          error?.code === "23503"
            ? "Il collega o il turno indicato non c'è più: ricarica la pagina e riprova."
            : dbErrorMessage(error, "Richiesta non inviata."),
      };
    }

    const what = `${requestTypeLabel(v.type)} · ${formatRange(startDate, endDate)}`;
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
    const { supabase, profile } = await authedAction();
    const requestId = z.uuid().parse(id);
    // Stato prima dell'annullamento: serve per sapere se il collega aveva già accettato.
    const { data: before } = await supabase
      .from("requests")
      .select("type, status, start_date, end_date, target_profile_id")
      .eq("id", requestId)
      .maybeSingle();
    const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
    if (error) return { ok: false, message: "La richiesta non si può più annullare." };
    if (before) {
      const what = `${requestTypeLabel(before.type)} · ${formatRange(before.start_date, before.end_date)}`;
      await notify(await adminIds(), {
        kind: "request_decided",
        title: `Richiesta annullata da ${profile.display_name}`,
        body: what,
        link: `/admin/richieste/${requestId}`,
      });
      // Il collega di uno scambio già accettato contava su quel turno: va avvisato.
      if (
        before.type === "scambio_turno" &&
        before.target_profile_id &&
        ["peer_accepted", "approved"].includes(before.status)
      ) {
        await notify([before.target_profile_id], {
          kind: "request_decided",
          title: `${profile.display_name} ha annullato lo scambio`,
          body: what,
          link: `/richieste/${requestId}`,
        });
      }
    }
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
    const text = z
      .string()
      .trim()
      .min(1, "Scrivi un commento.")
      .max(4000, "Al massimo 4000 caratteri.")
      .parse(body);
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

    // Destinatari: chi ha chiesto (se non è l'autore), il collega dello scambio e gli admin,
    // ciascuno con il collegamento alla propria pagina.
    const admins = (await adminIds()).filter((a) => a !== profile.id);
    const people = [r.profile_id, r.target_profile_id].filter(
      (p): p is string => Boolean(p) && p !== profile.id && !admins.includes(p!),
    );
    const notification = {
      kind: "request_decided" as const,
      title: `Nuovo commento di ${profile.display_name}`,
      body: text.slice(0, 140),
    };
    await Promise.all([
      notify(people, { ...notification, link: `/richieste/${id}` }),
      notify(admins, { ...notification, link: `/admin/richieste/${id}` }),
    ]);
    revalidatePath(`/richieste/${id}`);
    revalidatePath(`/admin/richieste/${id}`);
    return { ok: true };
  });
}

/** Allegati che una persona può caricare in 24 ore. */
const MAX_UPLOADS_PER_DAY = 20;

/** Carica un allegato in attachments/<uid>/… (se lo Storage è disponibile). */
export async function uploadRequestAttachment(
  formData: FormData,
): Promise<ActionResult<{ path: string; name: string }>> {
  return runAction(async () => {
    const { profile } = await authedAction();
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, message: "Scegli un file." };
    const invalid = attachmentError(file);
    if (invalid) return { ok: false, message: invalid };
    const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${profile.id}/${crypto.randomUUID()}-${safe}`;
    const storage = createAdminClient().storage.from("attachments");
    // Tetto ai caricamenti: al massimo MAX_UPLOADS_PER_DAY file al giorno per persona, così un
    // ciclo di invii non riempie lo spazio degli allegati di tutti.
    const { data: recent } = await storage.list(profile.id, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    const dayAgo = Date.now() - 86_400_000;
    const today = (recent ?? []).filter((f) => f.created_at && Date.parse(f.created_at) > dayAgo);
    if (today.length >= MAX_UPLOADS_PER_DAY) {
      return {
        ok: false,
        message:
          "Hai caricato troppi allegati oggi: riprova domani o consegna il documento a mano.",
      };
    }
    // Upload con la service role nella cartella dell'utente: lo Storage resta privato.
    const { error } = await storage.upload(path, file, { contentType: file.type });
    if (error) return { ok: false, message: "Allegati non disponibili in questo momento." };
    return { ok: true, data: { path, name: file.name } };
  });
}
