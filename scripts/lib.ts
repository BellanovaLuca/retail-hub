import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmployeeCode, syntheticEmail, type Role } from "../lib/auth/pin";
import type { Database } from "../lib/supabase/database.types";
import type { HomeZone as Zone } from "../lib/supabase/types";

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (vedi .env.example).",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type NewPerson = {
  code: string;
  pin: string;
  firstName: string;
  lastName: string;
  displayName: string;
  shortLabel?: string;
  role: Role;
  departments: string[]; // il primo è il reparto principale
  weeklyHours?: number;
  homeZone?: Zone;
  countsForCoverage?: boolean;
  mustChangePin: boolean;
  sortOrder?: number;
};

/** Crea l'utente Auth (email sintetica + PIN), il profilo e i reparti. Idempotente sul codice. */
export async function createPerson(db: ReturnType<typeof adminClient>, person: NewPerson) {
  const code = normalizeEmployeeCode(person.code);

  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("employee_code", code)
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data: created, error } = await db.auth.admin.createUser({
    email: syntheticEmail(code),
    password: person.pin,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error(`Utente ${code}: ${error?.message}`);
  const id = created.user.id;

  const { error: profileError } = await db.from("profiles").insert({
    id,
    first_name: person.firstName,
    last_name: person.lastName,
    display_name: person.displayName,
    short_label: person.shortLabel ?? person.displayName.toUpperCase(),
    employee_code: code,
    role: person.role,
    weekly_hours: person.weeklyHours ?? null,
    home_zone: person.homeZone ?? "vista",
    counts_for_coverage: person.countsForCoverage ?? true,
    must_change_pin: person.mustChangePin,
    privacy_accepted_at: person.mustChangePin ? null : new Date().toISOString(),
    sort_order: person.sortOrder ?? 0,
  });
  if (profileError) {
    await db.auth.admin.deleteUser(id);
    throw new Error(`Profilo ${code}: ${profileError.message}`);
  }

  const { data: departments } = await db.from("departments").select("id, name");
  const byName = new Map((departments ?? []).map((d) => [d.name, d.id]));
  const rows = person.departments.map((name, i) => {
    const departmentId = byName.get(name);
    if (!departmentId) throw new Error(`Reparto sconosciuto: ${name}`);
    return { profile_id: id, department_id: departmentId, is_primary: i === 0 };
  });
  const { error: depError } = await db.from("profile_departments").insert(rows);
  if (depError) throw new Error(`Reparti ${code}: ${depError.message}`);

  return { id, created: true };
}
