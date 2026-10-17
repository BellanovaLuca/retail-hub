import "server-only";
import type { PickerPerson } from "@/components/announcements/people-picker";
import { getPeopleDirectory } from "@/lib/data/announcements";
import { getDepartments } from "@/lib/data/people";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Reparti e persone (con il reparto principale come suggerimento) per i selettori. */
export async function getPickerData(db: Db) {
  const [departments, people] = await Promise.all([getDepartments(db), getPeopleDirectory(db)]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  return {
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    people: people.map((p): PickerPerson => ({
      id: p.id,
      name: p.displayName,
      color: p.color,
      hint: p.primaryDepartmentId ? deptName.get(p.primaryDepartmentId) : undefined,
    })),
  };
}
