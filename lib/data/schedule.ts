import "server-only";
import { addDays, format, parseISO } from "date-fns";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { parseOpeningHours, type OpeningHoursMap } from "@/lib/settings";
import { fetchAllRows } from "./paginate";
import type {
  LeaveRecord,
  PublishedShift,
  SchedulePerson,
  ShiftRecord,
  TemplateRecord,
} from "@/lib/schedule/types";

type Db = Awaited<ReturnType<typeof createClient>>;

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export function weekDates(weekStart: string): string[] {
  const monday = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), "yyyy-MM-dd"));
}

/** Valida un parametro di URL "yyyy-MM-dd" e lo riporta al lunedì della sua settimana. */
export function normalizeWeekParam(value: string | undefined, fallback: Date): string {
  const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : fallback;
  const safe = Number.isNaN(date.getTime()) ? fallback : date;
  const day = (safe.getDay() + 6) % 7;
  return format(addDays(safe, -day), "yyyy-MM-dd");
}

export async function getTemplates(db: Db): Promise<TemplateRecord[]> {
  const { data, error } = await db
    .from("shift_templates")
    .select("*")
    .order("sort_order")
    .order("code");
  // Mai un elenco vuoto al posto di un errore: chi pubblica o esporta lavorerebbe su dati monchi.
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    code: t.code,
    label: t.label,
    startTime: hhmm(t.start_time),
    endTime: hhmm(t.end_time),
    breakMinutes: t.break_minutes,
    isAbsence: t.is_absence,
  }));
}

/** Persone attive con i dati che servono alla pianificazione (solo admin). */
export async function getSchedulePeople(db: Db): Promise<SchedulePerson[]> {
  const [{ data: profiles, error }, { data: memberships, error: membershipsError }] =
    await Promise.all([
      db
        .from("profiles")
        .select(
          "id, display_name, short_label, color, home_zone, weekly_hours, counts_for_coverage, sort_order",
        )
        .eq("active", true)
        .order("sort_order")
        .order("display_name"),
      db.from("profile_departments").select("profile_id, department_id, is_primary"),
    ]);
  if (error ?? membershipsError) throw error ?? membershipsError;
  return (profiles ?? []).map((p) => {
    const mine = (memberships ?? []).filter((m) => m.profile_id === p.id);
    return {
      id: p.id,
      displayName: p.display_name,
      shortLabel: p.short_label ?? p.display_name.toUpperCase(),
      color: p.color,
      homeZone: p.home_zone,
      weeklyHours: p.weekly_hours,
      countsForCoverage: p.counts_for_coverage,
      primaryDepartmentId:
        mine.find((m) => m.is_primary)?.department_id ?? mine[0]?.department_id ?? null,
      departmentIds: mine.map((m) => m.department_id),
    };
  });
}

/** Persone come le vede chiunque (vista public_profiles: niente ore di contratto). */
export async function getPublicPeople(db: Db): Promise<SchedulePerson[]> {
  const { data } = await db
    .from("public_profiles")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("display_name");
  return (data ?? []).map((p) => ({
    id: p.id!,
    displayName: p.display_name!,
    shortLabel: p.short_label ?? p.display_name!.toUpperCase(),
    color: p.color,
    homeZone: (p.home_zone ?? "vista") as SchedulePerson["homeZone"],
    weeklyHours: null,
    countsForCoverage: true,
    primaryDepartmentId: p.primary_department_id,
    departmentIds: p.department_ids ?? [],
  }));
}

export type StoreCalendar = {
  openingHours: OpeningHoursMap;
  exceptions: Record<string, { open: string; close: string } | null>;
  holidays: { date: string; label: string; storeClosed: boolean }[];
};

export async function getStoreCalendar(db: Db, from: string, to: string): Promise<StoreCalendar> {
  const [{ data: settings }, { data: exceptions }, { data: holidays }] = await Promise.all([
    db.from("store_settings").select("opening_hours").eq("id", true).single(),
    db.from("opening_exceptions").select("*").gte("date", from).lte("date", to),
    db.from("holidays").select("*").gte("date", from).lte("date", to),
  ]);
  return {
    openingHours: parseOpeningHours(settings?.opening_hours),
    exceptions: Object.fromEntries(
      (exceptions ?? []).map((e) => [
        e.date,
        e.open_time && e.close_time
          ? { open: hhmm(e.open_time)!, close: hhmm(e.close_time)! }
          : null,
      ]),
    ),
    holidays: (holidays ?? []).map((h) => ({
      date: h.date,
      label: h.label,
      storeClosed: h.store_closed,
    })),
  };
}

export type AdminWeek = {
  week: {
    id: string;
    weekStart: string;
    status: "draft" | "published";
    version: number;
    publishedAt: string | null;
    note: string | null;
    ruleSetId: string | null;
    publishedShifts: PublishedShift[];
  };
  days: string[];
  shifts: ShiftRecord[];
  leaves: LeaveRecord[];
};

/** Settimana di lavoro dell'admin: la crea in bozza se non esiste ancora. */
export async function getAdminWeek(db: Db, weekStart: string): Promise<AdminWeek> {
  let { data: week } = await db
    .from("schedule_weeks")
    .select("*")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (!week) {
    const { data: created, error } = await db
      .from("schedule_weeks")
      .insert({ week_start: weekStart })
      .select("*")
      .single();
    if (error && error.code === "23505") {
      ({ data: week } = await db
        .from("schedule_weeks")
        .select("*")
        .eq("week_start", weekStart)
        .single());
    } else if (error) {
      throw error;
    } else {
      week = created;
    }
  }
  if (!week) throw new Error("Settimana non disponibile");

  const days = weekDates(weekStart);
  const { shifts, leaves } = await readWeekShiftsAndLeaves(db, week.id, days);

  return {
    week: {
      id: week.id,
      weekStart: week.week_start,
      status: week.status,
      version: week.version,
      publishedAt: week.published_at,
      note: week.note,
      ruleSetId: week.rule_set_id,
      publishedShifts: (week.published_shifts ?? []) as unknown as PublishedShift[],
    },
    days,
    shifts,
    leaves,
  };
}

/**
 * Turni di lavoro (in ordine stabile: giorno, orario d'inizio, id) e assenze di una settimana.
 * Senza `weekId` (settimana non ancora creata) i turni sono vuoti. Un errore di lettura viene
 * rilanciato.
 */
async function readWeekShiftsAndLeaves(
  db: Db,
  weekId: string | null,
  days: string[],
): Promise<{ shifts: ShiftRecord[]; leaves: LeaveRecord[] }> {
  const [{ data: shifts, error: shiftsError }, { data: leaves, error: leavesError }] =
    await Promise.all([
      weekId
        ? db
            .from("shifts")
            .select("*")
            .eq("week_id", weekId)
            .order("date")
            .order("start_time")
            .order("id")
        : Promise.resolve({ data: [] as Parameters<typeof toShiftRecord>[0][], error: null }),
      db
        .from("leaves")
        .select("profile_id, date, type, hours, status, source, request_id")
        .gte("date", days[0])
        .lte("date", days[6]),
    ]);
  // Una lettura fallita non è «settimana vuota»: pubblicando si cancellerebbero gli orari di tutti.
  if (shiftsError ?? leavesError) throw shiftsError ?? leavesError;
  return {
    shifts: (shifts ?? []).map(toShiftRecord),
    leaves: (leaves ?? []).map((l) => ({
      profileId: l.profile_id,
      date: l.date,
      type: l.type,
      hours: l.hours,
      status: l.status,
      source: l.source,
      requestId: l.request_id,
    })),
  };
}

/**
 * Turni di lavoro e assenze della settimana in SOLA LETTURA: a differenza di `getAdminWeek` non
 * crea la settimana se manca (serve alle pagine che la guardano soltanto, es. l'effetto di una
 * richiesta sulla copertura: aprire una pagina non deve scrivere nel database).
 */
export async function getWeekWorkingData(
  db: Db,
  weekStart: string,
): Promise<{ days: string[]; shifts: ShiftRecord[]; leaves: LeaveRecord[] }> {
  const days = weekDates(weekStart);
  const { data: week } = await db
    .from("schedule_weeks")
    .select("id")
    .eq("week_start", weekStart)
    .maybeSingle();
  return { days, ...(await readWeekShiftsAndLeaves(db, week?.id ?? null, days)) };
}

export function toShiftRecord(s: {
  id: string;
  profile_id: string;
  date: string;
  template_id: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  working_as_department_id: string | null;
  zone: "vista" | "sole" | null;
  is_back_office: boolean | null;
  note: string | null;
  conflict: boolean;
}): ShiftRecord {
  return {
    id: s.id,
    profileId: s.profile_id,
    date: s.date,
    templateId: s.template_id,
    start: hhmm(s.start_time),
    end: hhmm(s.end_time),
    breakMinutes: s.break_minutes,
    departmentId: s.working_as_department_id,
    zone: s.zone,
    isBackOffice: s.is_back_office,
    note: s.note,
    conflict: s.conflict,
  };
}

/** Turni pubblicati in un intervallo di date (per tutti: vista published_shifts). */
export async function getPublishedShifts(
  db: Db,
  from: string,
  to: string,
  profileId?: string,
): Promise<(PublishedShift & { week_version: number })[]> {
  // A pagine: su più settimane (es. i 4 mesi della nuova richiesta) le righe superano le 1000.
  const data = await fetchAllRows((start, end) => {
    let query = db
      .from("published_shifts")
      .select("*", { count: "exact" })
      .gte("date", from)
      .lte("date", to);
    if (profileId) query = query.eq("profile_id", profileId);
    return query.order("date").order("start_time").order("id").range(start, end);
  });
  return data.map(toPublishedShift);
}

type PublishedShiftRow = Database["public"]["Views"]["published_shifts"]["Row"];

function toPublishedShift(s: PublishedShiftRow): PublishedShift & { week_version: number } {
  return {
    id: s.id!,
    profile_id: s.profile_id!,
    date: s.date!,
    start_time: hhmm(s.start_time),
    end_time: hhmm(s.end_time),
    break_minutes: s.break_minutes ?? 0,
    template_code: s.template_code,
    template_label: s.template_label,
    is_absence: s.is_absence ?? false,
    zone: (s.zone as "vista" | "sole" | null) ?? null,
    is_back_office: s.is_back_office ?? false,
    department_id: s.department_id,
    note: s.note,
    changed: (s.changed ?? false) && (s.version ?? 1) > 1,
    week_version: s.version ?? 1,
  };
}

/**
 * Turni pubblicati di alcune persone in alcuni giorni precisi (poche righe: es. le due giornate
 * di uno scambio). Chi chiama filtra poi per persona + giorno.
 */
export async function getPublishedDays(
  db: Db,
  profileIds: string[],
  dates: string[],
): Promise<(PublishedShift & { week_version: number })[]> {
  if (profileIds.length === 0 || dates.length === 0) return [];
  const { data } = await db
    .from("published_shifts")
    .select("*")
    .in("profile_id", profileIds)
    .in("date", dates)
    .order("date")
    .order("start_time");
  return (data ?? []).map(toPublishedShift);
}

/** Assenze come le vede chiunque: "Ferie" o "Assente", mai il motivo. */
export async function getPublicLeaves(db: Db, from: string, to: string) {
  const { data } = await db.from("leaves_public").select("*").gte("date", from).lte("date", to);
  return (data ?? []).map((l) => ({
    profileId: l.profile_id!,
    date: l.date!,
    kind: l.kind as "ferie" | "assente",
    status: l.status as "tentative" | "confirmed",
  }));
}
