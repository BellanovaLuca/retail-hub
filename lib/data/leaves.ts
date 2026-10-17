import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { LeaveStatus, LeaveType } from "@/lib/domain/types";
import { parseLeaveThresholds } from "@/lib/leaves/plan";

type Db = Awaited<ReturnType<typeof createClient>>;

/** PostgREST restituisce al massimo 1000 righe per richiesta: si legge a pagine. */
const PAGE = 1000;

/** Assenza come la vede l'admin (con il motivo) o l'interessato. */
export type PlanLeave = {
  profileId: string;
  date: string;
  type: LeaveType;
  hours: number | null;
  status: LeaveStatus;
  source: "planning" | "request";
};

/** Assenza come la vedono tutti (vista leaves_public): "ferie" o "assente". */
export type PublicPlanLeave = {
  profileId: string;
  date: string;
  kind: "ferie" | "assente";
  status: LeaveStatus;
};

const yearBounds = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

/** Tabella `leaves` completa dell'anno (admin: tutti; altrimenti RLS lascia solo le proprie). */
export async function getYearLeaves(
  db: Db,
  year: number,
  profileId?: string,
): Promise<PlanLeave[]> {
  const { from, to } = yearBounds(year);
  const out: PlanLeave[] = [];
  for (let page = 0; ; page++) {
    let query = db
      .from("leaves")
      .select("profile_id, date, type, hours, status, source")
      .gte("date", from)
      .lte("date", to);
    if (profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query
      .order("date")
      .order("profile_id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    for (const l of data ?? []) {
      out.push({
        profileId: l.profile_id,
        date: l.date,
        type: l.type,
        hours: l.hours,
        status: l.status,
        source: l.source,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Planning pubblico dell'anno: mai il motivo dell'assenza (§3). */
export async function getYearPublicLeaves(db: Db, year: number): Promise<PublicPlanLeave[]> {
  const { from, to } = yearBounds(year);
  const out: PublicPlanLeave[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("leaves_public")
      .select("profile_id, date, kind, status")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("profile_id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    for (const l of data ?? []) {
      out.push({
        profileId: l.profile_id!,
        date: l.date!,
        kind: l.kind === "ferie" ? "ferie" : "assente",
        status: l.status === "tentative" ? "tentative" : "confirmed",
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Soglie per reparto: massimo di persone in ferie insieme ({ department_id: n }). */
export async function getLeaveThresholds(db: Db): Promise<Record<string, number>> {
  const { data } = await db
    .from("store_settings")
    .select("leave_thresholds")
    .eq("id", true)
    .single();
  return parseLeaveThresholds(data?.leave_thresholds);
}
