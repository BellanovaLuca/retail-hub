import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Department, Profile } from "@/lib/supabase/types";

type Db = Awaited<ReturnType<typeof createClient>>;

export type Membership = { departmentId: string; isPrimary: boolean };
export type StaffMember = Profile & { memberships: Membership[] };

export async function getDepartments(db: Db): Promise<Department[]> {
  const { data } = await db.from("departments").select("*").order("sort_order");
  return data ?? [];
}

/** Profili completi con i reparti (solo admin: RLS limita gli altri al proprio). */
export async function getStaff(
  db: Db,
  opts: { includeInactive?: boolean } = {},
): Promise<StaffMember[]> {
  let query = db.from("profiles").select("*").order("sort_order").order("display_name");
  if (!opts.includeInactive) query = query.eq("active", true);
  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    query,
    db.from("profile_departments").select("profile_id, department_id, is_primary"),
  ]);
  const byProfile = new Map<string, Membership[]>();
  for (const m of memberships ?? []) {
    const list = byProfile.get(m.profile_id) ?? [];
    list.push({ departmentId: m.department_id, isPrimary: m.is_primary });
    byProfile.set(m.profile_id, list);
  }
  return (profiles ?? []).map((p) => ({ ...p, memberships: byProfile.get(p.id) ?? [] }));
}

export function primaryDepartmentId(member: { memberships: Membership[] }) {
  return (
    member.memberships.find((m) => m.isPrimary)?.departmentId ??
    member.memberships[0]?.departmentId ??
    null
  );
}

export const zoneLabels = { vista: "Vista", sole: "Sole", jolly: "Jolly" } as const;
export const roleLabels = { admin: "Amministratore", employee: "Dipendente" } as const;
