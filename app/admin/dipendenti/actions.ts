"use server";

import { randomBytes } from "node:crypto";
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
import { authPassword } from "@/lib/auth/secret";
import { nowInRome, toISODate } from "@/lib/dates";
import { sameName } from "@/lib/employees/confirm";
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
    short_label: shortLabelOf(v),
    employee_code: v.employeeCode,
    role: v.role,
    weekly_hours: v.weeklyHours,
    home_zone: v.homeZone,
    counts_for_coverage: v.countsForCoverage,
    color: v.color,
    email: v.email ?? null,
    phone: v.phone ?? null,
  };
}

const shortLabelOf = (v: EmployeeValues) =>
  v.shortLabel ?? v.displayName.toUpperCase().slice(0, 12);

/** Nome visualizzato e sigla di colonna devono distinguere le persone (§3: omonimi). */
async function ensureUniqueNames(db: Db, v: EmployeeValues, exceptId?: string) {
  const escape = (s: string) => s.replace(/[%_\\]/g, "\\$&");
  const exists = async (column: "display_name" | "short_label", value: string) => {
    let query = db.from("profiles").select("id").ilike(column, escape(value));
    if (exceptId) query = query.neq("id", exceptId);
    const { data } = await query.limit(1);
    return Boolean(data && data.length > 0);
  };
  if (await exists("display_name", v.displayName)) {
    throw new FieldError({
      displayName: "Questo nome visualizzato è già usato da un'altra persona.",
    });
  }
  if (await exists("short_label", shortLabelOf(v))) {
    throw new FieldError({
      shortLabel: `La sigla "${shortLabelOf(v)}" è già usata da un'altra persona: scegline una diversa.`,
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

/**
 * Note riservate degli admin: stanno in `profile_admin_notes` (solo admin via RLS), non sul
 * profilo, che l'interessato può leggere. Note vuote = nessuna riga.
 */
async function saveAdminNotes(db: Db, profileId: string, notes: string | null | undefined) {
  const { error } = notes
    ? await db
        .from("profile_admin_notes")
        .upsert({ profile_id: profileId, notes }, { onConflict: "profile_id" })
    : await db.from("profile_admin_notes").delete().eq("profile_id", profileId);
  if (error) throw new ActionError(dbErrorMessage(error, "Note non salvate."));
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
  const { error } = await db.from("profile_kpis").upsert(
    items.map((i) => ({
      profile_id: profileId,
      kpi_id: i.kpi_id,
      label_override: i.label_override,
      sort_order: i.sort_order,
    })),
    { onConflict: "profile_id,kpi_id", ignoreDuplicates: true },
  );
  // Non blocca la creazione: le voci si assegnano comunque alla prima conferma degli obiettivi.
  if (error) console.error("nuovo dipendente: voci degli obiettivi non assegnate", error);
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
    await ensureUniqueNames(supabase, v);

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
      password: randomBytes(32).toString("hex"), // provvisoria: sotto si imposta l'impronta del PIN
      email_confirm: true,
    });
    if (authError || !created.user) {
      return { ok: false, message: "Non è stato possibile creare l'accesso. Riprova." };
    }
    const id = created.user.id;
    // La password vera è l'impronta del PIN legata all'id appena creato.
    const { error: pinError } = await admin.auth.admin.updateUserById(id, {
      password: authPassword(id, pin),
    });
    if (pinError) {
      await admin.auth.admin.deleteUser(id);
      return { ok: false, message: "Non è stato possibile impostare il PIN. Riprova." };
    }

    // Il profilo lo scrive l'admin con la propria sessione, così finisce nel registro a suo nome.
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true });
    const { error } = await supabase
      .from("profiles")
      .insert({ id, ...profileRow(v), must_change_pin: true, sort_order: (count ?? 0) + 1 });
    if (error) {
      await admin.auth.admin.deleteUser(id);
      return { ok: false, message: dbErrorMessage(error, "Dipendente non creato.") };
    }
    try {
      await saveDepartments(supabase, id, v);
      await saveAdminNotes(supabase, id, v.adminNotes);
    } catch (error) {
      // Creazione a metà: si annulla tutto (il profilo sparisce a cascata con l'accesso), così
      // non resta un account senza reparti il cui PIN non è mai stato mostrato.
      const { error: undoError } = await admin.auth.admin.deleteUser(id);
      if (undoError) console.error("nuovo dipendente: annullamento non riuscito", undoError);
      throw error;
    }
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
    await ensureUniqueNames(supabase, v, id);

    const { data: current } = await supabase
      .from("profiles")
      .select("employee_code, role")
      .eq("id", id)
      .single();
    if (!current) return { ok: false, message: "Dipendente non trovato." };

    const codeChanged = current.employee_code !== v.employeeCode;
    if (codeChanged) {
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .eq("employee_code", v.employeeCode)
        .maybeSingle();
      if (taken) throw new FieldError({ employeeCode: "Codice già assegnato." });
    }

    // Chi diventa amministratore deve scegliere un PIN da amministratore (più lungo): finché
    // non lo cambia resterebbe con quello a 6 cifre da dipendente.
    const promoted = current.role !== "admin" && v.role === "admin";
    const { error } = await supabase
      .from("profiles")
      .update({ ...profileRow(v), ...(promoted ? { must_change_pin: true } : {}) })
      .eq("id", id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Modifiche non salvate.") };

    if (codeChanged) {
      // Il codice è il login: va aggiornata anche l'email sintetica dell'accesso. Si fa DOPO il
      // profilo e, se non riesce, il codice del profilo torna quello di prima: con codice ed
      // email diversi la persona non riuscirebbe più a entrare.
      const { error: authError } = await createAdminClient().auth.admin.updateUserById(id, {
        email: syntheticEmail(v.employeeCode),
        email_confirm: true,
      });
      if (authError) {
        const { error: undoError } = await supabase
          .from("profiles")
          .update({ employee_code: current.employee_code })
          .eq("id", id);
        if (undoError) console.error("cambio codice: ripristino non riuscito", undoError);
        revalidatePath(`/admin/dipendenti/${id}`);
        return {
          ok: false,
          message: undoError
            ? "Non è stato possibile cambiare il codice. Salva di nuovo per completare il cambio."
            : "Non è stato possibile cambiare il codice: resta quello di prima. Riprova.",
        };
      }
    }
    await saveDepartments(supabase, id, v);
    await saveAdminNotes(supabase, id, v.adminNotes);

    revalidatePath("/admin/dipendenti");
    revalidatePath(`/admin/dipendenti/${id}`);
    return {
      ok: true,
      message: promoted
        ? "Modifiche salvate. Al prossimo accesso dovrà scegliere un PIN da amministratore."
        : "Modifiche salvate.",
    };
  });
}

/** Nuovo PIN provvisorio, mostrato una sola volta; cambio obbligatorio al primo accesso. */
export async function resetPin(id: string): Promise<ActionResult<Credentials>> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    if (id === profile.id) {
      return { ok: false, message: "Per cambiare il tuo PIN usa la pagina Profilo." };
    }
    const { data: person } = await supabase
      .from("profiles")
      .select("display_name, employee_code, role, must_change_pin")
      .eq("id", id)
      .single();
    if (!person) return { ok: false, message: "Dipendente non trovato." };

    // Prima l'obbligo di cambio (se non si riesce a segnarlo il PIN resta quello di prima), poi
    // il PIN: così non esiste mai un PIN provvisorio senza obbligo di cambiarlo.
    const { error: flagError } = await supabase
      .from("profiles")
      .update({ must_change_pin: true })
      .eq("id", id);
    if (flagError) return { ok: false, message: dbErrorMessage(flagError, "PIN non aggiornato.") };

    const pin = generatePin(person.role);
    const { error } = await createAdminClient().auth.admin.updateUserById(id, {
      password: authPassword(id, pin),
    });
    if (error) {
      if (!person.must_change_pin) {
        const { error: undoError } = await supabase
          .from("profiles")
          .update({ must_change_pin: false })
          .eq("id", id);
        if (undoError) console.error("reset PIN: ripristino non riuscito", undoError);
      }
      return { ok: false, message: "PIN non aggiornato. Riprova." };
    }

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

/**
 * Disattiva (persona uscita) o riattiva: accesso bloccato, storico conservato.
 *
 * Alla disattivazione i turni della persona da oggi in poi vengono tolti, anche dagli orari già
 * pubblicati: altrimenti resterebbero invisibili nel foglio (che mostra solo le persone attive)
 * ma contati nelle coperture. La riattivazione non li ripristina. Ogni riga tolta finisce nel
 * registro a nome dell'admin.
 *
 * Ordine pensato per poter riprovare: prima i turni (una transazione), poi il blocco
 * dell'accesso, poi il profilo; se l'ultimo passo fallisce il blocco torna com'era.
 */
export async function setEmployeeActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile: me } = await adminAction();
    const personId = z.uuid().parse(id);
    const wanted = z.boolean().parse(active);
    if (personId === me.id && !wanted)
      return { ok: false, message: "Non puoi disattivare il tuo account." };

    let removed: { shifts: number; weeks: number } | null = null;
    if (!wanted) {
      const { data, error } = await supabase.rpc("remove_future_shifts", {
        p_profile_id: personId,
        p_from: toISODate(nowInRome()),
      });
      if (error) {
        return {
          ok: false,
          message: dbErrorMessage(
            error,
            "Non è stato possibile togliere i turni futuri: l'account resta attivo. Riprova.",
          ),
        };
      }
      const counts = (data ?? {}) as { shifts?: number; weeks?: number };
      removed = { shifts: Number(counts.shifts ?? 0), weeks: Number(counts.weeks ?? 0) };
    }

    const admin = createAdminClient();
    const { error: banError } = await admin.auth.admin.updateUserById(personId, {
      ban_duration: wanted ? "none" : "876000h",
    });
    if (banError) return { ok: false, message: "Operazione non riuscita. Riprova." };
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ active: wanted })
      .eq("id", personId)
      .select("id");
    if (error || !updated?.length) {
      // Accesso e profilo devono dire la stessa cosa: il blocco torna com'era.
      const { error: undoError } = await admin.auth.admin.updateUserById(personId, {
        ban_duration: wanted ? "876000h" : "none",
      });
      if (undoError)
        console.error("attiva/disattiva: ripristino del blocco non riuscito", undoError);
      return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita. Riprova.") };
    }

    revalidatePath("/admin/dipendenti");
    revalidatePath(`/admin/dipendenti/${personId}`);
    if (removed && (removed.shifts > 0 || removed.weeks > 0)) {
      revalidatePath("/admin/turni", "layout");
      revalidatePath("/admin");
      revalidatePath("/orari", "layout");
      revalidatePath("/");
    }
    if (wanted) return { ok: true, message: "Account riattivato." };
    return {
      ok: true,
      message: removed?.shifts
        ? `Account disattivato: ${removed.shifts === 1 ? "tolto 1 turno" : `tolti ${removed.shifts} turni`} da oggi in poi${removed.weeks ? " (anche dagli orari pubblicati)" : ""}.`
        : "Account disattivato.",
    };
  });
}

/** Elenca (fino a due livelli di cartelle) i file sotto `prefix` di un bucket. */
async function listFiles(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      // Le cartelle non hanno id.
      if (entry.id) out.push(path);
      else if (depth < 2) out.push(...(await listFiles(admin, bucket, path, depth + 1)));
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * File personali nello Storage: allegati delle richieste (anche certificati) e foto, in
 * `attachments/<id>/…` e `avatars/<id>/…`. Gli errori non bloccano l'eliminazione dell'account
 * ma restano nel log; restituisce false se qualcosa non è stato rimosso.
 */
async function removePersonFiles(
  admin: ReturnType<typeof createAdminClient>,
  personId: string,
): Promise<boolean> {
  let clean = true;
  for (const bucket of ["attachments", "avatars"]) {
    try {
      const paths = await listFiles(admin, bucket, personId);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
    } catch (error) {
      clean = false;
      console.error(`eliminazione account ${personId}: file di "${bucket}" non rimossi`, error);
    }
  }
  return clean;
}

/**
 * Elimina definitivamente un account (es. persona creata per errore): profilo, turni, ferie,
 * richieste, numeri e notifiche spariscono a cascata. Per chi ha lavorato in negozio è meglio
 * disattivare, così lo storico resta.
 *
 * Passaggi, nell'ordine, pensati per poter essere ripetuti senza danni se uno fallisce
 * (fino all'ultimo la scheda della persona esiste ancora e si può riprovare da lì):
 * 1. accesso bloccato e account disattivato (nessun nuovo login mentre si cancella);
 * 2. la persona viene tolta dagli orari già pubblicati;
 * 3. via gli scambi che i colleghi le avevano proposto (il vincolo li impedirebbe);
 * 4. via i suoi file dallo Storage (allegati delle richieste, foto): un errore qui non blocca;
 * 5. registro modifiche: chi elimina chi;
 * 6. account di accesso eliminato: profilo e dati collegati spariscono a cascata, in un passo.
 */
export async function deleteEmployee(id: string, confirmName: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile: me } = await adminAction();
    const personId = z.uuid().parse(id);
    if (personId === me.id) return { ok: false, message: "Non puoi eliminare il tuo account." };
    const admin = createAdminClient();

    const { data: person } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", personId)
      .maybeSingle();

    if (!person) {
      // Profilo già eliminato in un tentativo precedente: resta solo l'accesso da togliere.
      const { data: orphan } = await admin.auth.admin.getUserById(personId);
      if (!orphan?.user) return { ok: false, message: "Dipendente non trovato." };
      await removePersonFiles(admin, personId);
      const { error } = await admin.auth.admin.deleteUser(personId);
      if (error) return { ok: false, message: "Eliminazione non completata. Riprova." };
      revalidatePath("/admin/dipendenti");
      return { ok: true, message: "Eliminazione completata." };
    }

    // La conferma col nome si ricontrolla qui: non basta il pulsante disabilitato nel browser.
    if (!sameName(confirmName, person.display_name)) {
      return {
        ok: false,
        message: `Per confermare scrivi esattamente il nome "${person.display_name}".`,
      };
    }

    const fail = (message: string) => ({
      ok: false as const,
      message: `${message} L'account è bloccato: riprova per completare l'eliminazione.`,
    });

    // 1. Accesso bloccato subito.
    const { error: banError } = await admin.auth.admin.updateUserById(personId, {
      ban_duration: "876000h",
    });
    if (banError) return { ok: false, message: "Eliminazione non riuscita: riprova." };
    await supabase.from("profiles").update({ active: false }).eq("id", personId);

    // 2. Fuori dagli orari già pubblicati.
    const { data: weeks, error: weeksError } = await supabase
      .from("schedule_weeks")
      .select("id, published_shifts")
      .filter("published_shifts", "cs", JSON.stringify([{ profile_id: personId }]));
    if (weeksError) return fail("Non è stato possibile aggiornare gli orari pubblicati.");
    for (const w of weeks ?? []) {
      const list = (w.published_shifts ?? []) as { profile_id?: string }[];
      const { error } = await supabase
        .from("schedule_weeks")
        .update({ published_shifts: list.filter((s) => s.profile_id !== personId) })
        .eq("id", w.id);
      if (error) return fail("Non è stato possibile aggiornare gli orari pubblicati.");
    }

    // 3. Scambi proposti a lei dai colleghi.
    const { error: swapError } = await supabase
      .from("requests")
      .delete()
      .eq("type", "scambio_turno")
      .eq("target_profile_id", personId);
    if (swapError) return fail("Non è stato possibile togliere gli scambi che la riguardano.");

    // 4. File personali nello Storage (la cascata del database non li tocca).
    await removePersonFiles(admin, personId);

    // 5. Registro modifiche a nome dell'admin (la cascata del passo 6 non ha un autore).
    await admin.from("audit_log").insert({
      actor_id: me.id,
      action: "delete",
      entity: "profiles",
      entity_id: personId,
      diff: { eliminazione_account: person.display_name },
    });

    // 6. Account di accesso: profilo e dati collegati spariscono a cascata, in un solo passo.
    const { error: deleteError } = await admin.auth.admin.deleteUser(personId);
    if (deleteError) return fail("Eliminazione dell'account non riuscita.");

    revalidatePath("/admin/dipendenti");
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
    return { ok: true, message: `${person.display_name} è stata eliminata con tutti i suoi dati.` };
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
