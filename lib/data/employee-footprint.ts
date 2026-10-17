import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Tutto ciò che è legato a una persona e che sparisce eliminando il suo account. */
export type EmployeeFootprint = {
  /** Ha mai completato il primo accesso. */
  everLoggedIn: boolean;
  shifts: number;
  /** Settimane già pubblicate in cui compare (i colleghi la vedono negli orari). */
  publishedWeeks: number;
  leaves: number;
  requests: number;
  /** Scambi che i colleghi le hanno proposto: senza di lei vengono eliminati. */
  swapsProposedToHer: number;
  dailyEntries: number;
  weeklyTargets: number;
  weeklyComments: number;
  performanceGoals: number;
  /** Responsabilità di cui è la responsabile: restano senza responsabile. */
  ownedResponsibilities: string[];
  /** Responsabilità in cui è di supporto: perdono un supporto. */
  supportedResponsibilities: string[];
  extraTasks: number;
};

/** Da chiamare con il client dell'admin (RLS: l'admin legge tutto). */
export async function getEmployeeFootprint(db: Db, id: string): Promise<EmployeeFootprint> {
  const count = async (
    table:
      | "shifts"
      | "leaves"
      | "requests"
      | "daily_entries"
      | "weekly_targets"
      | "weekly_comments"
      | "performance_goals"
      | "extra_task_assignees",
  ) =>
    (await db.from(table).select("*", { count: "exact", head: true }).eq("profile_id", id)).count ??
    0;

  const [
    { data: profile },
    shifts,
    leaves,
    requests,
    dailyEntries,
    weeklyTargets,
    weeklyComments,
    performanceGoals,
    extraTasks,
    { count: swapsProposedToHer },
    { count: publishedWeeks },
    { data: assignments },
  ] = await Promise.all([
    db.from("profiles").select("privacy_accepted_at").eq("id", id).maybeSingle(),
    count("shifts"),
    count("leaves"),
    count("requests"),
    count("daily_entries"),
    count("weekly_targets"),
    count("weekly_comments"),
    count("performance_goals"),
    count("extra_task_assignees"),
    db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("type", "scambio_turno")
      .eq("target_profile_id", id),
    db
      .from("schedule_weeks")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .filter("published_shifts", "cs", JSON.stringify([{ profile_id: id }])),
    db
      .from("responsibility_assignees")
      .select("role, responsibilities(title)")
      .eq("profile_id", id),
  ]);

  const titles = (role: "owner" | "support") =>
    (assignments ?? [])
      .filter((a) => a.role === role)
      .map((a) => (a.responsibilities as { title: string } | null)?.title)
      .filter((t): t is string => Boolean(t));

  return {
    everLoggedIn: Boolean(profile?.privacy_accepted_at),
    shifts,
    publishedWeeks: publishedWeeks ?? 0,
    leaves,
    requests,
    swapsProposedToHer: swapsProposedToHer ?? 0,
    dailyEntries,
    weeklyTargets,
    weeklyComments,
    performanceGoals,
    ownedResponsibilities: titles("owner"),
    supportedResponsibilities: titles("support"),
    extraTasks,
  };
}
