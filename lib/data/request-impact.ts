import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { shiftTimesText, swapConflicts, swapSignature, type DayOccupation } from "@/lib/requests";
import { evaluateRules } from "@/lib/rules/registry";
import type { Violation } from "@/lib/rules/types";
import type { createClient } from "@/lib/supabase/server";
import { weekStart } from "@/lib/dates";
import { buildRuleContext, getWeekRules } from "./rules";
import { getPublishedDays } from "./schedule";

type Db = Awaited<ReturnType<typeof createClient>>;

export type SwapContext = {
  /** I due giorni coinvolti, in ordine. */
  dates: string[];
  /** Per giorno e persona, cosa ha già in agenda (turni di lavoro e assenze). */
  byDayAndPerson: { date: string; profileId: string; items: string[] }[];
  warnings: string[];
};

/**
 * Contesto di uno scambio turno per l'admin: turni (versione di lavoro) e assenze dei due
 * colleghi nei giorni coinvolti, con un avviso se chi riceve un turno è già occupato.
 */
export async function swapContext(
  db: Db,
  r: {
    profile_id: string;
    target_profile_id: string | null;
    start_date: string;
    target_date: string | null;
    status?: string;
    /** Firma degli orari salvata quando il collega ha accettato (null = nessuna). */
    swap_signature?: string | null;
  },
  names: Map<string, string>,
): Promise<SwapContext | null> {
  if (!r.target_profile_id) return null;
  const people = [r.profile_id, r.target_profile_id];
  const dates = [...new Set([r.start_date, r.target_date].filter((d): d is string => Boolean(d)))];
  const [{ data: shifts }, { data: leaves }] = await Promise.all([
    db
      .from("shifts")
      .select("profile_id, date, start_time, end_time, template:shift_templates(label, is_absence)")
      .in("profile_id", people)
      .in("date", dates)
      .order("start_time"),
    db
      .from("leaves")
      .select("profile_id, date, type, hours, status")
      .in("profile_id", people)
      .in("date", dates),
  ]);
  const occupations: DayOccupation[] = [
    ...(shifts ?? []).map((s) => {
      const absence = Boolean(s.template?.is_absence) || !s.start_time;
      return {
        profileId: s.profile_id,
        date: s.date,
        kind: absence ? ("assenza" as const) : ("turno" as const),
        text: absence
          ? (s.template?.label?.toLowerCase() ?? "assente")
          : `${s.start_time!.slice(0, 5)}–${s.end_time?.slice(0, 5)}`,
      };
    }),
    ...(leaves ?? []).map((l) => ({
      profileId: l.profile_id,
      date: l.date,
      kind: "assenza" as const,
      text: `${LEAVE_WORDS[l.type] ?? "assente"}${l.status === "tentative" ? " (da confermare)" : ""}`,
    })),
  ];
  const name = (id: string) => names.get(id) ?? "—";

  // Avvisi sugli orari, finché lo scambio è aperto.
  const drift: string[] = [];
  if (!r.status || r.status === "pending" || r.status === "peer_accepted") {
    const working = (shifts ?? []).map((x) => ({
      profileId: x.profile_id,
      date: x.date,
      start: x.start_time,
      end: x.end_time,
    }));
    // 1. Il collega ha accettato degli orari precisi (firma): se da allora un turno è cambiato
    //    l'approvazione non passa e la richiesta torna in attesa del collega.
    const current = swapSignature({
      shifts: working,
      requesterId: r.profile_id,
      startDate: r.start_date,
      targetId: r.target_profile_id,
      targetDate: r.target_date,
    });
    if (r.status === "peer_accepted" && r.swap_signature && r.swap_signature !== current) {
      drift.push(
        `Attenzione: il turno dello scambio è cambiato dopo l'accettazione di ${name(r.target_profile_id)}. All'approvazione la richiesta tornerà in attesa del collega, che dovrà accettare di nuovo.`,
      );
    }
    // 2. Lo scambio si chiede e si accetta guardando i turni PUBBLICATI, ma si scambiano quelli
    //    del foglio di lavoro: se sono diversi, i due colleghi non vedono ciò che riceveranno.
    const published = await getPublishedDays(db, people, dates);
    const check = (profileId: string, date: string | null) => {
      if (!date) return;
      const inSheet = shiftTimesText(
        working.filter((x) => x.profileId === profileId && x.date === date),
      );
      const shown = shiftTimesText(
        published
          .filter((x) => x.profile_id === profileId && x.date === date && !x.is_absence)
          .map((x) => ({ start: x.start_time, end: x.end_time })),
      );
      if (inSheet === shown) return;
      const day = format(parseISO(date), "EEE d MMM", { locale: it });
      drift.push(
        `Attenzione: il turno di ${name(profileId)} di ${day} nel foglio turni (${inSheet || "nessun turno"}) è diverso da quello pubblicato (${shown || "nessun turno"}), che è quello che vedono i due colleghi. Si scambia quello del foglio turni: meglio ripubblicare la settimana prima di approvare.`,
      );
    };
    check(r.profile_id, r.start_date);
    check(r.target_profile_id, r.target_date);
  }

  const byDayAndPerson = dates.flatMap((date) =>
    people.map((profileId) => ({
      date,
      profileId,
      items: occupations
        .filter((o) => o.profileId === profileId && o.date === date)
        .map((o) => (o.kind === "turno" ? o.text : o.text[0].toUpperCase() + o.text.slice(1))),
    })),
  );
  return {
    dates,
    byDayAndPerson,
    // Dopo l'approvazione i turni sono già passati di mano: "ha già un turno" sarebbe proprio
    // il turno ricevuto con lo scambio, non un conflitto.
    warnings:
      r.status === "approved"
        ? []
        : [
            ...drift,
            ...swapConflicts({
              requester: { id: r.profile_id, name: name(r.profile_id) },
              target: { id: r.target_profile_id, name: name(r.target_profile_id) },
              shiftDate: r.start_date,
              targetDate: r.target_date,
              occupations,
              formatDay: (d) => format(parseISO(d), "EEE d MMM", { locale: it }),
            }),
          ],
  };
}

const LEAVE_WORDS: Record<string, string> = {
  ferie: "in ferie",
  permesso: "in permesso",
  malattia: "in malattia",
  altro: "assente",
};

/**
 * Effetto sulla copertura di una richiesta di assenza: avvisi che comparirebbero togliendo
 * i turni della persona in quei giorni (versione di lavoro dei turni). Al massimo 3 settimane.
 * Sola lettura: `buildRuleContext` non crea le settimane che mancano (aprire la richiesta non
 * deve lasciare settimane in bozza né righe nel registro).
 */
export async function requestCoverageImpact(
  db: Db,
  r: {
    profile_id: string;
    start_date: string;
    end_date: string;
    recurring_weekdays: number[] | null;
    type: string;
  },
): Promise<{ added: Violation[]; weeks: string[] }> {
  if (!["ferie", "permesso", "giorno_libero", "indisponibilita", "malattia"].includes(r.type)) {
    return { added: [], weeks: [] };
  }
  const weeks: string[] = [];
  for (
    let w = weekStart(parseISO(r.start_date));
    w <= parseISO(r.end_date) && weeks.length < 3;
    w = addDays(w, 7)
  ) {
    weeks.push(format(w, "yyyy-MM-dd"));
  }
  const inRequest = (date: string) =>
    date >= r.start_date &&
    date <= r.end_date &&
    (!r.recurring_weekdays?.length ||
      r.recurring_weekdays.includes(((parseISO(date).getDay() + 6) % 7) + 1));

  const added: Violation[] = [];
  for (const week of weeks) {
    const { data: row } = await db
      .from("schedule_weeks")
      .select("rule_set_id")
      .eq("week_start", week)
      .maybeSingle();
    const [ctx, { rules }] = await Promise.all([
      buildRuleContext(db, week),
      getWeekRules(db, row?.rule_set_id ?? null),
    ]);
    const before = evaluateRules(ctx, rules);
    const after = evaluateRules(
      {
        ...ctx,
        shifts: ctx.shifts.filter((s) => !(s.profileId === r.profile_id && inRequest(s.date))),
      },
      rules,
    );
    const seen = new Set(before.filter((v) => v.severity === "warning").map((v) => v.message));
    added.push(...after.filter((v) => v.severity === "warning" && !seen.has(v.message)));
  }
  return { added, weeks };
}
