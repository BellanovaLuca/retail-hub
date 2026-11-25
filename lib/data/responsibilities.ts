import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAttachments, type Attachment } from "@/lib/announcements/model";
import { getPeopleDirectory, type Person } from "@/lib/data/announcements";
import {
  daysOfPerson,
  dutiesForPerson,
  effectiveWeekPlan,
  isScheduledOn,
  mondayOf,
  peopleOnShift,
  resolveDuty,
  shiftDate,
  uncoveredOn,
  withWeekTeam,
  personDaysOf,
  type Duty,
  type PersonDays,
  type ResponsibilityAssignment,
  type WeekTeam,
} from "@/lib/responsibilities/assignment";
import { nowInRome, toISODate } from "@/lib/dates";
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

/**
 * Assegnazione settimanale in vigore per ogni attività nella settimana indicata (quella della
 * settimana stessa o l'ultima precedente): una riga per attività, calcolata dal database.
 */
export async function getWeekTeams(db: Db, uptoWeek: string): Promise<Map<string, WeekTeam[]>> {
  const { data, error } = await db.rpc("responsibility_week_teams", { p_week: uptoWeek });
  if (error) throw new Error(`Assegnazioni settimanali non lette: ${error.message}`);
  const rows = (Array.isArray(data) ? data : []) as {
    responsibility_id: string;
    week_start: string;
    profile_ids: string[] | null;
    person_days: Record<string, unknown> | null;
  }[];
  const out = new Map<string, WeekTeam[]>();
  for (const row of rows) {
    const personDays: PersonDays = {};
    for (const [id, days] of Object.entries(row.person_days ?? {})) {
      if (Array.isArray(days)) personDays[id] = days.filter((d) => typeof d === "number");
    }
    out.set(row.responsibility_id, [
      { weekStart: row.week_start, profileIds: row.profile_ids ?? [], personDays },
    ]);
  }
  return out;
}

/**
 * Attività con responsabile e supporti, nell'ordine del tabellone. Con `week` (lunedì) vale
 * l'assegnazione settimanale, se l'attività ne ha una: gli assegnati finiscono in `supports`
 * (tutti alla pari) e `weekly` è true.
 */
export async function getResponsibilities(
  db: Db,
  opts: { includeInactive?: boolean; people?: Map<string, Person>; week?: string } = {},
): Promise<ResponsibilityItem[]> {
  let query = db.from("responsibilities").select("*");
  if (!opts.includeInactive) query = query.eq("active", true);
  const [{ data: rows }, { data: assignees }, byId, teams] = await Promise.all([
    query.order("sort_order").order("title"),
    db
      .from("responsibility_assignees")
      .select("responsibility_id, profile_id, role, sort_order")
      .order("sort_order"),
    opts.people ? Promise.resolve(opts.people) : directory(db).then((d) => d.byId),
    opts.week ? getWeekTeams(db, opts.week) : Promise.resolve(null),
  ]);
  // Dalla settimana corrente in poi chi è stato disattivato non conta più tra gli assegnati
  // (le settimane passate restano com'erano: lì ha lavorato davvero).
  const hideInactive = !!opts.week && opts.week >= mondayOf(toISODate(nowInRome()));
  const counts = (id: string) => !hideInactive || byId.get(id)?.active === true;
  return (rows ?? []).map((r) => {
    const mine = (assignees ?? []).filter(
      (a) => a.responsibility_id === r.id && counts(a.profile_id),
    );
    const owner = mine.find((a) => a.role === "owner");
    const supports = mine.filter((a) => a.role === "support");
    const plan = teams && opts.week ? effectiveWeekPlan(teams.get(r.id) ?? [], opts.week) : null;
    if (plan && !r.all_staff) {
      const base = {
        id: r.id,
        title: r.title,
        descriptionMd: r.description_md,
        scheduleDays: [...r.schedule_days].sort(),
        allStaff: false,
        active: r.active,
        attachments: parseAttachments(r.attachments),
        sortOrder: r.sort_order,
        ownerId: null,
        supportIds: [],
        owner: null,
        supports: [],
      };
      const weekly = withWeekTeam(
        base,
        plan.profileIds.filter((id) => byId.has(id) && counts(id)),
        plan.personDays,
      );
      return { ...weekly, supports: weekly.supportIds.map((id) => ref(byId, id)) };
    }
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
    getResponsibilities(db, { people: byId, week: weekStart }),
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
  const [{ data: open }, { data: closed }, byId] = await Promise.all([
    db.from("extra_tasks").select("*").eq("status", "open"),
    db
      .from("extra_tasks")
      .select("*")
      .in("status", opts.includeCancelled ? ["done", "cancelled"] : ["done"])
      .gte("updated_at", since),
    opts.people ? Promise.resolve(opts.people) : directory(db).then((d) => d.byId),
  ]);
  const rows = [...(open ?? []), ...(closed ?? [])];
  // Solo gli assegnatari delle attività mostrate (a blocchi: gli id viaggiano nell'indirizzo).
  const assignees: { task_id: string; profile_id: string }[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const { data } = await db
      .from("extra_task_assignees")
      .select("task_id, profile_id")
      .in(
        "task_id",
        rows.slice(i, i + 100).map((t) => t.id),
      );
    assignees.push(...(data ?? []));
  }
  return rows
    .map((t) => ({
      id: t.id,
      title: t.title,
      descriptionMd: t.description_md,
      dueDate: t.due_date,
      status: t.status,
      assignees: assignees.filter((a) => a.task_id === t.id).map((a) => ref(byId, a.profile_id)),
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
    getResponsibilities(db, { people: byId, week: mondayOf(date) }),
    getOnShift(db, date),
    getChecks(db, date, date, byId),
    db
      .from("extra_task_assignees")
      .select("task_id, extra_tasks!inner(*)")
      .eq("profile_id", profileId)
      .eq("extra_tasks.status", "open"),
  ]);
  const duties = dutiesForPerson(items, profileId, date, onShift);
  return {
    date,
    scheduleKnown: onShift !== null,
    responsibilities: duties.map((d) => {
      const r = d.responsibility as ResponsibilityItem;
      const check = checks[r.id]?.[date];
      const replacingName = d.replacingId ? (byId.get(d.replacingId)?.displayName ?? "—") : null;
      const teammates = (d.teammateIds ?? []).map((id) => byId.get(id)?.displayName ?? "—");
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
                : teammates.length
                  ? `Con ${teammates.join(", ")}`
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
    getResponsibilities(db, { people: byId, week: mondayOf(date) }),
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
        .filter((r) => r.ownerId === p.id || (r.weekly && r.supportIds.includes(p.id)))
        .map((r) => ({ id: r.id, title: r.title, days: daysOfPerson(r, p.id) }));
      return {
        person: { id: p.id, name: p.displayName, color: p.color },
        owner,
        support: items
          .filter((r) => !r.weekly && r.supportIds.includes(p.id))
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

/** Una responsabilità nell'assegnazione della settimana. */
export type WeekPlannerItem = {
  id: string;
  title: string;
  /** Attività per tutti: non si assegna, si scelgono solo i giorni. */
  allStaff: boolean;
  /** Giorni previsti (per le attività «per tutti» sono i giorni in cui va fatta). */
  scheduleDays: number[];
  /** Per ogni persona attiva assegnata, i giorni (1–7) della settimana. */
  personDays: PersonDays;
  /**
   * Da dove viene l'assegnazione: `week` = scelta per questa settimana; `inherited` = ripresa
   * dall'ultima settimana assegnata (`fromWeek`); `standing` = responsabile e supporti della scheda.
   */
  source: "week" | "inherited" | "standing";
  fromWeek: string | null;
};

export type WeekPlanner = {
  weekStart: string;
  items: WeekPlannerItem[];
  people: PersonRef[];
};

/** Dati dell'assegnazione persone × giorni, attività per attività, per la settimana (lunedì). */
export async function getWeekPlanner(db: Db, weekStart: string): Promise<WeekPlanner> {
  const { people, byId } = await directory(db);
  const [items, teams] = await Promise.all([
    getResponsibilities(db, { people: byId, week: weekStart }),
    getWeekTeams(db, weekStart),
  ]);
  return {
    weekStart,
    items: items.map((r) => {
      const plan = r.allStaff ? null : effectiveWeekPlan(teams.get(r.id) ?? [], weekStart);
      return {
        id: r.id,
        title: r.title,
        allStaff: r.allStaff,
        scheduleDays: r.scheduleDays,
        personDays: Object.fromEntries(
          Object.entries(personDaysOf(r)).filter(([id]) => byId.get(id)?.active),
        ),
        source: !plan ? "standing" : plan.weekStart === weekStart ? "week" : "inherited",
        fromWeek: plan?.weekStart ?? null,
      };
    }),
    people: people
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.displayName, color: p.color })),
  };
}

/** Chi è in turno in ciascun giorno indicato (null = turni di quel giorno non pubblicati). */
export async function getOnShiftByDay(
  db: Db,
  days: string[],
): Promise<Record<string, string[] | null>> {
  if (days.length === 0) return {};
  const sorted = [...days].sort();
  const { data } = await db
    .from("published_shifts")
    .select("profile_id, date, is_absence")
    .gte("date", sorted[0])
    .lte("date", sorted[sorted.length - 1]);
  const shifts = (data ?? []).map((s) => ({
    profile_id: s.profile_id!,
    date: s.date!,
    is_absence: s.is_absence ?? false,
  }));
  return Object.fromEntries(
    days.map((d) => {
      const set = peopleOnShift(shifts, d);
      return [d, set ? [...set] : null];
    }),
  );
}
