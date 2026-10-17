import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { periodLabel, type Pillar, type Progress } from "@/lib/performance/goals";

type Db = Awaited<ReturnType<typeof createClient>>;

export type Period = { id: string; year: number; label: string };

/** Obiettivo completo, come lo vede l'admin. */
export type AdminGoal = {
  id: string;
  profileId: string;
  pillar: Pillar;
  slot: number;
  title: string;
  objective: string;
  comment: string | null;
  progress: Progress | null;
  employeeNote: string | null;
  privateNote: string | null;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

/** Obiettivo come lo vede il dipendente (vista my_performance_goals: niente nota privata). */
export type MyGoal = {
  id: string;
  pillar: Pillar;
  slot: number;
  title: string;
  objective: string;
  comment: string | null;
  progress: Progress | null;
  employeeNote: string | null;
  publishedAt: string | null;
};

export async function getPeriods(db: Db): Promise<Period[]> {
  const { data } = await db.from("performance_periods").select("id, year, label").order("year");
  return data ?? [];
}

export async function getPeriod(db: Db, year: number): Promise<Period | null> {
  const { data } = await db
    .from("performance_periods")
    .select("id, year, label")
    .eq("year", year)
    .maybeSingle();
  return data;
}

/** Periodo dell'anno: lo crea ("Performance AAAA") se manca. Solo admin (RLS). */
export async function ensurePeriod(db: Db, year: number): Promise<Period> {
  const found = await getPeriod(db, year);
  if (found) return found;
  const { data, error } = await db
    .from("performance_periods")
    .insert({ year, label: periodLabel(year) })
    .select("id, year, label")
    .single();
  if (error?.code === "23505") {
    const again = await getPeriod(db, year);
    if (again) return again;
  }
  if (error || !data) throw error ?? new Error("Periodo non disponibile");
  return data;
}

export function toAdminGoal(g: Tables<"performance_goals">): AdminGoal {
  return {
    id: g.id,
    profileId: g.profile_id,
    pillar: g.pillar,
    slot: g.slot,
    title: g.title,
    objective: g.objective,
    comment: g.comment,
    progress: g.progress,
    employeeNote: g.employee_note,
    privateNote: g.private_note,
    published: g.published,
    publishedAt: g.published_at,
    updatedAt: g.updated_at,
  };
}

/** Tutti gli obiettivi del periodo (solo admin). */
export async function getPeriodGoals(
  db: Db,
  periodId: string,
  profileId?: string,
): Promise<AdminGoal[]> {
  let query = db.from("performance_goals").select("*").eq("period_id", periodId);
  if (profileId) query = query.eq("profile_id", profileId);
  const { data, error } = await query.order("pillar").order("slot");
  if (error) throw error;
  return (data ?? []).map(toAdminGoal);
}

/** I propri obiettivi pubblicati dell'anno: legge SOLO la vista my_performance_goals. */
export async function getMyGoals(db: Db, periodId: string): Promise<MyGoal[]> {
  const { data, error } = await db
    .from("my_performance_goals")
    .select("*")
    .eq("period_id", periodId)
    .order("pillar")
    .order("slot");
  if (error) throw error;
  return (data ?? []).map((g) => ({
    id: g.id!,
    pillar: g.pillar as Pillar,
    slot: g.slot ?? 1,
    title: g.title ?? "",
    objective: g.objective ?? "",
    comment: g.comment,
    progress: (g.progress as Progress | null) ?? null,
    employeeNote: g.employee_note,
    publishedAt: g.published_at,
  }));
}
