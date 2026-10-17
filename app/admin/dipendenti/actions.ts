"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  adminAction,
  dbErrorMessage,
  runAction,
  zodFieldErrors,
  type ActionResult,
} from "@/lib/auth/guards";
import { credentialsMessage, generatePin, syntheticEmail } from "@/lib/auth/pin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { employeeSchema, type EmployeeInput, type EmployeeValues } from "@/lib/validators/employee";

type Db = Awaited<ReturnType<typeof createClient>>;

export type Credentials = { displayName: string; code: string; pin: string; message: string };

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

function profileRow(v: EmployeeValues) {
  return {
    first_name: v.firstName,
    last_name: v.lastName,
    display_name: v.displayName,
    short_label: v.shortLabel ?? v.displayName.toUpperCase().slice(0, 12),
    employee_code: v.employeeCode,
    role: v.role,
    weekly_hours: v.weeklyHours,
    home_zone: v.homeZone,
    counts_for_coverage: v.countsForCoverage,
    color: v.color,
    email: v.email ?? null,
    phone: v.phone ?? null,
    admin_notes: v.adminNotes ?? null,
  };
}

async function ensureUniqueDisplayName(db: Db, displayName: string, exceptId?: string) {
  let query = db
    .from("profiles")
    .select("id")
    .ilike("display_name", displayName.replace(/[%_]/g, "\\$&"));
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.limit(1);
  if (data && data.length > 0) {
    throw new FieldError({
      displayName: "Questo nome visualizzato è già usato da un'altra persona.",
    });
  }
}

class FieldError extends Error {
  constructor(public fields: Record<string, string>) {
    super("Controlla i campi evidenziati.");
  }
}

async function saveDepartments(db: Db, profileId: string, v: EmployeeValues) {
  const { error: delError } = await db
    .from("profile_departments")
    .delete()
    .eq("profile_id", profileId);
  if (delError) throw new ActionError(dbErrorMessage(delError, "Reparti non salvati."));
  const { error } = await db.from("profile_departments").insert(
    v.departmentIds.map((departmentId) => ({
      profile_id: profileId,
      department_id: departmentId,
      is_primary: departmentId === v.primaryDepartmentId,
    })),
  );
  if (error) throw new ActionError(dbErrorMessage(error, "Reparti non salvati."));
}

/** Le voci degli obiettivi della persona partono dal gruppo della sua area (§8.3). */
async function assignDefaultKpis(db: Db, profileId: string, homeZone: EmployeeValues["homeZone"]) {
  const setName = homeZone === "sole" ? "Sole" : "Vista";
  const { data: set } = await db.from("kpi_sets").select("id").eq("name", setName).maybeSingle();
  if (!set) return;
  const { data: items } = await db
    .from("kpi_set_items")
    .select("kpi_id, label_override, sort_order")
    .eq("set_id", set.id);
  if (!items?.length) return;
  await db.from("profile_kpis").upsert(
    items.map((i) => ({
      profile_id: profileId,
      kpi_id: i.kpi_id,
      label_override: i.label_override,
      sort_order: i.sort_order,
    })),
    { onConflict: "profile_id,kpi_id", ignoreDuplicates: true },
  );
}

function withFieldErrors<T>(fn: () => Promise<ActionResult<T>>) {
  return runAction<T>(async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof FieldError) {
        return { ok: false, message: error.message, fieldErrors: error.fields };
      }
      throw error;
    }
  });
}

export async function createEmployee(
  input: EmployeeInput,
): Promise<ActionResult<Credentials & { id: string }>> {
  return withFieldErrors(async () => {
    const { supabase } = await adminAction();
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Controlla i campi evidenziati.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    await ensureUniqueDisplayName(supabase, v.displayName);

    const { data: codeTaken } = await supabase
      .from("profiles")
      .select("id")
      .eq("employee_code", v.employeeCode)
      .maybeSingle();
    if (codeTaken) throw new FieldError({ employeeCode: "Codice già assegnato." });

    const pin = generatePin(v.role);
    const admin = createAdminClient();
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: syntheticEmail(v.employeeCode),
      password: pin,
      email_confirm: true,
    });
    if (authError || !created.user) {
      return { ok: false, message: "Non è stato possibile creare l'accesso. Riprova." };
    }
    const id = created.user.id;

    // Il profilo lo scrive l'admin con la propria sessione, così finisce nel registro a suo nome.
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true });
    const { error } = await supabase
      .from("profiles")
      .insert({ id, ...profileRow(v), must_change_pin: true, sort_order: (count ?? 0) + 1 });
    if (error) {
      await admin.auth.admin.deleteUser(id);
      return { ok: false, message: dbErrorMessage(error, "Dipendente non creato.") };
    }
    await saveDepartments(supabase, id, v);
    await assignDefaultKpis(supabase, id, v.homeZone);

    revalidatePath("/admin/dipendenti");
    return {
      ok: true,
      data: {
        id,
        displayName: v.displayName,
        code: v.employeeCode,
        pin,
        message: credentialsMessage({
          appUrl: appUrl(),
          displayName: v.displayName,
          code: v.employeeCode,
          pin,
        }),
      },
    };
  });
}

export async function updateEmployee(id: string, input: EmployeeInput): Promise<ActionResult> {
  return withFieldErrors(async () => {
    const { supabase, profile: me } = await adminAction();
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Controlla i campi evidenziati.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    if (id === me.id && v.role !== "admin") {
      return { ok: false, message: "Non puoi togliere a te stesso il ruolo di amministratore." };
    }
    await ensureUniqueDisplayName(supabase, v.displayName, id);

    const { data: current } = await supabase
      .from("profiles")
      .select("employee_code")
      .eq("id", id)
      .single();
    if (!current) return { ok: false, message: "Dipendente non trovato." };

    if (current.employee_code !== v.employeeCode) {
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .eq("employee_code", v.employeeCode)
        .maybeSingle();
      if (taken) throw new FieldError({ employeeCode: "Codice già assegnato." });
      // Il codice è il login: va aggiornata anche l'email sintetica dell'accesso.
      const { error } = await createAdminClient().auth.admin.updateUserById(id, {
        email: syntheticEmail(v.employeeCode),
        email_confirm: true,
      });
      if (error) return { ok: false, message: "Non è stato possibile cambiare il codice." };
    }

    const { error } = await supabase.from("profiles").update(profileRow(v)).eq("id", id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Modifiche non salvate.") };
    await saveDepartments(supabase, id, v);

    revalidatePath("/admin/dipendenti");
    revalidatePath(`/admin/dipendenti/${id}`);
    return { ok: true, message: "Modifiche salvate." };
  });
}

/** Nuovo PIN provvisorio, mostrato una sola volta; cambio obbligatorio al primo accesso. */
export async function resetPin(id: string): Promise<ActionResult<Credentials>> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const { data: person } = await supabase
      .from("profiles")
      .select("display_name, employee_code, role")
      .eq("id", id)
      .single();
    if (!person) return { ok: false, message: "Dipendente non trovato." };

    const pin = generatePin(person.role);
    const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: pin });
    if (error) return { ok: false, message: "PIN non aggiornato. Riprova." };
    await supabase.from("profiles").update({ must_change_pin: true }).eq("id", id);

    revalidatePath(`/admin/dipendenti/${id}`);
    return {
      ok: true,
      data: {
        displayName: person.display_name,
        code: person.employee_code,
        pin,
        message: credentialsMessage({
          appUrl: appUrl(),
          displayName: person.display_name,
          code: person.employee_code,
          pin,
        }),
      },
    };
  });
}

/** Disattiva (persona uscita) o riattiva: accesso bloccato, storico conservato. */
export async function setEmployeeActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile: me } = await adminAction();
    if (id === me.id && !active)
      return { ok: false, message: "Non puoi disattivare il tuo account." };

    const { error: banError } = await createAdminClient().auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : "876000h",
    });
    if (banError) return { ok: false, message: "Operazione non riuscita. Riprova." };
    const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita.") };

    revalidatePath("/admin/dipendenti");
    revalidatePath(`/admin/dipendenti/${id}`);
    return { ok: true, message: active ? "Account riattivato." : "Account disattivato." };
  });
}

/** Ordine manuale delle persone in griglia. */
export async function reorderEmployees(orderedIds: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await adminAction();
    const ids = z.array(z.uuid()).max(500).parse(orderedIds);
    const results = await Promise.all(
      ids.map((id, i) =>
        supabase
          .from("profiles")
          .update({ sort_order: i + 1 })
          .eq("id", id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error)
      return { ok: false, message: dbErrorMessage(failed.error, "Ordine non salvato.") };
    revalidatePath("/admin/dipendenti");
    return { ok: true, message: "Ordine salvato." };
  });
}
