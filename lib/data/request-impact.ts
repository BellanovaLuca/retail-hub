import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { swapConflicts, type DayOccupation } from "@/lib/requests";
import { evaluateRules } from "@/lib/rules/registry";
import type { Violation } from "@/lib/rules/types";
import type { createClient } from "@/lib/supabase/server";
import { weekStart } from "@/lib/dates";
import { buildRuleContext, getWeekRules } from "./rules";

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
    warnings: swapConflicts({
      requester: { id: r.profile_id, name: name(r.profile_id) },
      target: { id: r.target_profile_id, name: name(r.target_profile_id) },
      shiftDate: r.start_date,
      targetDate: r.target_date,
      occupations,
      formatDay: (d) => format(parseISO(d), "EEE d MMM", { locale: it }),
    }),
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
