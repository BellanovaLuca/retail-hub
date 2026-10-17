import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAttachments, type Attachment } from "@/lib/announcements/model";
import { getPeopleDirectory, type Person } from "@/lib/data/announcements";
import {
  dutiesForPerson,
  isScheduledOn,
  peopleOnShift,
  resolveDuty,
  shiftDate,
  uncoveredOn,
  type Duty,
  type ResponsibilityAssignment,
} from "@/lib/responsibilities/assignment";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type Db = SupabaseClient<Database>;

export type PersonRef = { id: string; name: string; color: string | null };

export type ResponsibilityItem = ResponsibilityAssignment & {
  descriptionMd: string;
  attachments: Attachment[];
  sortOrder: number;
  active: boolean;
  owner: PersonRef | null;
  supports: PersonRef[];
};

export type CheckInfo = {
  responsibilityId: string;
  date: string;
  doneById: string | null;
  doneByName: string | null;
  doneAt: string;
  note: string | null;
};

const ref = (people: Map<string, Person>, id: string): PersonRef => {
  const p = people.get(id);
  return { id, name: p?.displayName ?? "—", color: p?.color ?? null };
};

async function directory(db: Db) {
  const people = await getPeopleDirectory(db, { includeInactive: true });
  return { people, byId: new Map(people.map((p) => [p.id, p])) };
}

/** Attività con responsabile e supporti, nell'ordine del tabellone. */
export async function getResponsibilities(
  db: Db,
  opts: { includeInactive?: boolean; people?: Map<string, Person> } = {},
): Promise<ResponsibilityItem[]> {
  let query = db.from("responsibilities").select("*");
  if (!opts.includeInactive) query = query.eq("active", true);
  const [{ data: rows }, { data: assignees }, byId] = await Promise.all([
    query.order("sort_order").order("title"),
    db
      .from("responsibility_assignees")
      .select("responsibility_id, profile_id, role, sort_order")
      .order("sort_order"),
    opts.people ? Promise.resolve(opts.people) : directory(db).then((d) => d.byId),
  ]);
  return (rows ?? []).map((r) => {
    const mine = (assignees ?? []).filter((a) => a.responsibility_id === r.id);
    const owner = mine.find((a) => a.role === "owner");
    const supports = mine.filter((a) => a.role === "support");
    return {
      id: r.id,
      title: r.title,
      descriptionMd: r.description_md,
      scheduleDays: [...r.schedule_days].sort(),
      allStaff: r.all_staff,
      active: r.active,
      attachments: parseAttachments(r.attachments),
      sortOrder: r.sort_order,
      ownerId: r.all_staff ? null : (owner?.profile_id ?? null),
      supportIds: r.all_staff ? [] : supports.map((s) => s.profile_id),
      owner: !r.all_staff && owner ? ref(byId, owner.profile_id) : null,
      supports: r.all_staff ? [] : supports.map((s) => ref(byId, s.profile_id)),
    };
  });
}

/** Spunte nell'intervallo, indicizzate per attività e data. */
export async function getChecks(
  db: Db,
  from: string,
  to: string,
  people: Map<string, Person>,
): Promise<Record<string, Record<string, CheckInfo>>> {
  const { data } = await db
    .from("responsibility_checks")
    .select("responsibility_id, date, done_by, done_at, note")
    .gte("date", from)
    .lte("date", to);
  const out: Record<string, Record<string, CheckInfo>> = {};
  for (const c of data ?? []) {
    (out[c.responsibility_id] ??= {})[c.date] = {
      responsibilityId: c.responsibility_id,
      date: c.date,
      doneById: c.done_by,
      doneByName: c.done_by ? (people.get(c.done_by)?.displayName ?? "—") : null,
      doneAt: c.done_at,
      note: c.note,
    };
  }
  return out;
}

/** Chi è in turno in una data, dai turni pubblicati (null = turni non noti). */
export async function getOnShift(db: Db, date: string): Promise<Set<string> | null> {
  const { data } = await db
    .from("published_shifts")
    .select("profile_id, date, is_absence")
    .eq("date", date);
  return peopleOnShift(
    (data ?? []).map((s) => ({
      profile_id: s.profile_id!,
      date: s.date!,
      is_absence: s.is_absence ?? false,
    })),
    date,
  );
}

export type Board = {
  weekStart: string;
  days: string[];
  today: string;
  items: ResponsibilityItem[];
  checks: Record<string, Record<string, CheckInfo>>;
  /** Chi deve fare l'attività oggi (solo se la settimana mostrata contiene oggi). */
  todayDuty: Record<string, Duty> | null;
  /** Turni di oggi noti? (false = settimana non pubblicata) */
  todayScheduleKnown: boolean;
  people: Person[];
};

export async function getBoard(db: Db, weekStart: string, today: string): Promise<Board> {
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const { people, byId } = await directory(db);
  const containsToday = days.includes(today);
  const [items, checks, onShift] = await Promise.all([
    getResponsibilities(db, { people: byId }),
    getChecks(db, days[0], days[6], byId),
    containsToday ? getOnShift(db, today) : Promise.resolve(null),
  ]);
  return {
    weekStart,
    days,
    today,
    items,
    checks,
    todayDuty: containsToday
      ? Object.fromEntries(items.map((r) => [r.id, resolveDuty(r, today, onShift)]))
      : null,
    todayScheduleKnown: onShift !== null,
    people,
  };
}

export type ExtraTask = {
  id: string;
  title: string;
  descriptionMd: string;
  dueDate: string | null;
  status: "open" | "done" | "cancelled";
  assignees: PersonRef[];
  createdByName: string | null;
  doneByName: string | null;
  doneAt: string | null;
  createdAt: string;
};

/** Attività extra: aperte e chiuse di recente (ultimi `recentDays` giorni). */
export async function getExtraTasks(
  db: Db,
  opts: { recentDays?: number; people?: Map<string, Person>; includeCancelled?: boolean } = {},
): Promise<ExtraTask[]> {
  const since = new Date(Date.now() - (opts.recentDays ?? 30) * 86_400_000).toISOString();
  const [{ data: open }, { data: closed }, { data: assignees }, byId] = await Promise.all([
    db.from("extra_tasks").select("*").eq("status", "open"),
    db
      .from("extra_tasks")
      .select("*")
      .in("status", opts.includeCancelled ? ["done", "cancelled"] : ["done"])
      .gte("updated_at", since),
    db.from("extra_task_assignees").select("task_id, profile_id"),
    opts.people ? Promise.resolve(opts.people) : directory(db).then((d) => d.byId),
  ]);
  const rows = [...(open ?? []), ...(closed ?? [])];
  return rows
    .map((t) => ({
      id: t.id,
      title: t.title,
      descriptionMd: t.description_md,
      dueDate: t.due_date,
      status: t.status,
      assignees: (assignees ?? [])
        .filter((a) => a.task_id === t.id)
        .map((a) => ref(byId, a.profile_id)),
      createdByName: t.created_by ? (byId.get(t.created_by)?.displayName ?? null) : null,
      doneByName: t.done_by ? (byId.get(t.done_by)?.displayName ?? null) : null,
      doneAt: t.done_at,
      createdAt: t.created_at,
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      if (a.status === "open") {
        // Le aperte per scadenza (senza scadenza in fondo).
        return (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1;
      }
      return (a.doneAt ?? a.createdAt) < (b.doneAt ?? b.createdAt) ? 1 : -1;
    });
}

export type TodayResponsibilityDuty = {
  id: string;
  title: string;
  descriptionMd: string;
  /** owner = responsabile; substitute = sostituisce il responsabile; support = supporto
   *  (attività senza responsabile); all_staff = attività per tutti. */
  role: "owner" | "substitute" | "support" | "all_staff";
  /** Per role = substitute: "Oggi sostituisci {replacingName}". */
  replacingName: string | null;
  label: string | null;
  done: boolean;
  doneByName: string | null;
  doneAt: string | null;
};

export type TodayExtraTask = {
  id: string;
  title: string;
  dueDate: string | null;
  overdue: boolean;
  dueToday: boolean;
};

export type TodayDuties = {
  date: string;
  /** false se per la data non risultano turni pubblicati: vale l'assegnazione "di carta". */
  scheduleKnown: boolean;
  responsibilities: TodayResponsibilityDuty[];
  extraTasks: TodayExtraTask[];
};

/**
 * Card Home "Oggi tocca a te": le responsabilità previste nella data che toccano alla persona
 * (come responsabile in turno, o come supporto che sostituisce il responsabile assente, o
 * attività per tutti se è in turno), con lo stato della spunta, più le attività extra aperte
 * assegnate alla persona.
 */
export async function getTodayDuties(
  db: Db,
  profileId: string,
  date: string,
): Promise<TodayDuties> {
  const { byId } = await directory(db);
  const [items, onShift, checks, { data: myTasks }] = await Promise.all([
    getResponsibilities(db, { people: byId }),
    getOnShift(db, date),
    getChecks(db, date, date, byId),
    db
      .from("extra_task_assignees")
      .select("task_id, extra_tasks!inner(*)")
      .eq("profile_id", profileId),
  ]);
  const duties = dutiesForPerson(items, profileId, date, onShift);
  return {
    date,
    scheduleKnown: onShift !== null,
    responsibilities: duties.map((d) => {
      const r = d.responsibility as ResponsibilityItem;
      const check = checks[r.id]?.[date];
      const replacingName = d.replacingId ? (byId.get(d.replacingId)?.displayName ?? "—") : null;
      return {
        id: r.id,
        title: r.title,
        descriptionMd: r.descriptionMd,
        role: d.role,
        replacingName,
        label:
          d.role === "substitute"
            ? `Oggi sostituisci ${replacingName}`
            : d.role === "all_staff"
              ? "Per tutti"
              : d.role === "support"
                ? "Supporto"
                : null,
        done: !!check,
        doneByName: check?.doneByName ?? null,
        doneAt: check?.doneAt ?? null,
      };
    }),
    extraTasks: (myTasks ?? [])
      .map((row) => row.extra_tasks)
      .filter((t) => t.status === "open")
      .sort((a, b) => ((a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1))
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        overdue: !!t.due_date && t.due_date < date,
        dueToday: t.due_date === date,
      })),
  };
}

export type UncoveredResponsibility = {
  id: string;
  title: string;
  ownerId: string | null;
  ownerName: string | null;
  supportNames: string[];
};

/**
 * Per il cron mattutino degli admin (service role): attività previste nella data per cui né il
 * responsabile né alcun supporto è in turno. Se per la data non ci sono turni pubblicati
 * restituisce un elenco vuoto (non si sa chi c'è: niente allarmi a vuoto).
 */
export async function findUncoveredResponsibilities(
  date: string,
): Promise<UncoveredResponsibility[]> {
  const db = createAdminClient();
  const { byId } = await directory(db);
  const [items, onShift] = await Promise.all([
    getResponsibilities(db, { people: byId }),
    getOnShift(db, date),
  ]);
  return uncoveredOn(items, date, onShift).map((r) => {
    const item = r as ResponsibilityItem;
    return {
      id: item.id,
      title: item.title,
      ownerId: item.ownerId,
      ownerName: item.owner?.name ?? null,
      supportNames: item.supports.map((s) => s.name),
    };
  });
}

/** Di cosa si occupa ciascuno (per la vista per persona e per bilanciare i carichi). */
export type PersonLoad = {
  person: PersonRef;
  owner: { id: string; title: string; days: number[] }[];
  support: { id: string; title: string; days: number[] }[];
  extra: { id: string; title: string; dueDate: string | null }[];
  /** Giorni-attività a settimana come responsabile. */
  ownerDays: number;
};

export function loadsByPerson(
  people: Person[],
  items: ResponsibilityItem[],
  tasks: ExtraTask[],
): PersonLoad[] {
  return people
    .filter((p) => p.active)
    .map((p) => {
      const owner = items
        .filter((r) => r.ownerId === p.id)
        .map((r) => ({ id: r.id, title: r.title, days: r.scheduleDays }));
      return {
        person: { id: p.id, name: p.displayName, color: p.color },
        owner,
        support: items
          .filter((r) => r.supportIds.includes(p.id))
          .map((r) => ({ id: r.id, title: r.title, days: r.scheduleDays })),
        extra: tasks
          .filter((t) => t.status === "open" && t.assignees.some((a) => a.id === p.id))
          .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
        ownerDays: owner.reduce((sum, r) => sum + r.days.length, 0),
      };
    });
}

export type AssignmentHistoryEntry = {
  at: string;
  action: "insert" | "delete";
  actorName: string | null;
  personName: string;
  role: "owner" | "support";
};

/**
 * Storico delle assegnazioni di un'attività, dal registro modifiche (audit_log, solo admin).
 * Le assegnazioni si cambiano sempre togliendo e aggiungendo righe, così ogni voce del registro
 * porta con sé l'attività, la persona e il ruolo.
 */
export async function getAssignmentHistory(
  db: Db,
  responsibilityId: string,
): Promise<AssignmentHistoryEntry[]> {
  const [{ data }, { byId }] = await Promise.all([
    db
      .from("audit_log")
      .select("at, action, actor_id, diff")
      .eq("entity", "responsibility_assignees")
      .eq("diff->>responsibility_id", responsibilityId)
      .in("action", ["insert", "delete"])
      .order("at", { ascending: false })
      .limit(100),
    directory(db),
  ]);
  return (data ?? []).flatMap((row) => {
    const diff = row.diff as { profile_id?: string; role?: string } | null;
    if (!diff?.profile_id || (diff.role !== "owner" && diff.role !== "support")) return [];
    return [
      {
        at: row.at,
        action: row.action as "insert" | "delete",
        actorName: row.actor_id ? (byId.get(row.actor_id)?.displayName ?? null) : null,
        personName: byId.get(diff.profile_id)?.displayName ?? "—",
        role: diff.role,
      },
    ];
  });
}

export { isScheduledOn };
