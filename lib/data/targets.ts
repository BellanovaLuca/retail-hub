import "server-only";
import { parseISO } from "date-fns";
import { getSchedulePeople, toShiftRecord } from "@/lib/data/schedule";
import { nowInRome, toISODate, weekNumber, weekStart as mondayOf } from "@/lib/dates";
import { countedHoursByPerson } from "@/lib/kpi/assignment";
import { parseRule } from "@/lib/kpi/rules";
import { missingCompilers, type MissingByDay } from "@/lib/kpi/monitoring";
import {
  buildPersonSheet,
  weekDates,
  type EntryValue,
  type SheetKpi,
  type SheetRow,
} from "@/lib/kpi/sheet";
import type { createClient } from "@/lib/supabase/server";
import type { DefaultTargetRule, StoreWeeklyTargets, TargetZone } from "@/lib/targets";

type Db = Awaited<ReturnType<typeof createClient>>;

/* ------------------------------------------------------------------ voci */

export type KpiDefinition = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  rule: DefaultTargetRule;
  sortOrder: number;
  active: boolean;
};

export async function getKpiDefinitions(db: Db): Promise<KpiDefinition[]> {
  const { data } = await db
    .from("kpi_definitions")
    .select("id, code, label, description, default_target_rule, sort_order, active")
    .order("sort_order")
    .order("code");
  return (data ?? []).map((k) => ({
    id: k.id,
    code: k.code,
    label: k.label,
    description: k.description,
    rule: parseRule(k.default_target_rule),
    sortOrder: k.sort_order,
    active: k.active,
  }));
}

export type KpiSet = {
  id: string;
  name: string;
  items: { kpiId: string; labelOverride: string | null; sortOrder: number }[];
};

export async function getKpiSets(db: Db): Promise<KpiSet[]> {
  const [{ data: sets }, { data: items }] = await Promise.all([
    db.from("kpi_sets").select("id, name").order("name", { ascending: false }),
    db
      .from("kpi_set_items")
      .select("set_id, kpi_id, label_override, sort_order")
      .order("sort_order"),
  ]);
  return (sets ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    items: (items ?? [])
      .filter((i) => i.set_id === s.id)
      .map((i) => ({ kpiId: i.kpi_id, labelOverride: i.label_override, sortOrder: i.sort_order })),
  }));
}

/** Gruppo di voci predefinito per l'area di base: i jolly partono dal gruppo Vista (§8.3). */
export function setNameForZone(zone: TargetZone): "Vista" | "Sole" {
  return zone === "sole" ? "Sole" : "Vista";
}

export type PersonKpi = SheetKpi & {
  sortOrder: number;
  labelOverride: string | null;
  /** true se la persona non ha ancora voci proprie e si usa il gruppo della sua area. */
  fromGroup: boolean;
};

/**
 * Voci di ciascuna persona: le sue `profile_kpis` attive (voci attive), altrimenti quelle del
 * gruppo della sua area. Etichetta: quella personale, poi quella del gruppo, poi quella della voce.
 */
export async function getPeopleKpis(
  db: Db,
  people: { id: string; zone: TargetZone }[],
  defs?: KpiDefinition[],
  sets?: KpiSet[],
): Promise<Map<string, PersonKpi[]>> {
  const ids = people.map((p) => p.id);
  const [definitions, groups, { data: rows }] = await Promise.all([
    defs ?? getKpiDefinitions(db),
    sets ?? getKpiSets(db),
    ids.length
      ? db
          .from("profile_kpis")
          .select("profile_id, kpi_id, label_override, sort_order, active")
          .in("profile_id", ids)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const defById = new Map(definitions.filter((d) => d.active).map((d) => [d.id, d]));
  const out = new Map<string, PersonKpi[]>();
  for (const p of people) {
    const own = (rows ?? []).filter((r) => r.profile_id === p.id);
    let list: PersonKpi[];
    if (own.length > 0) {
      list = own
        .filter((r) => r.active && defById.has(r.kpi_id))
        .map((r) => {
          const d = defById.get(r.kpi_id)!;
          return {
            kpiId: d.id,
            code: d.code,
            label: r.label_override || d.label,
            labelOverride: r.label_override,
            sortOrder: r.sort_order,
            fromGroup: false,
          };
        });
    } else {
      const group = groups.find((g) => g.name === setNameForZone(p.zone));
      list = (group?.items ?? [])
        .filter((i) => defById.has(i.kpiId))
        .map((i) => {
          const d = defById.get(i.kpiId)!;
          return {
            kpiId: d.id,
            code: d.code,
            label: i.labelOverride || d.label,
            labelOverride: i.labelOverride,
            sortOrder: i.sortOrder,
            fromGroup: true,
          };
        });
    }
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "it"));
    out.set(p.id, list);
  }
  return out;
}

/* ---------------------------------------------------------- settimana */

export async function getEntries(
  db: Db,
  from: string,
  to: string,
  profileIds?: string[],
): Promise<EntryValue[]> {
  let query = db
    .from("daily_entries")
    .select("profile_id, kpi_id, date, value")
    .gte("date", from)
    .lte("date", to);
  if (profileIds) query = query.in("profile_id", profileIds);
  const { data } = await query;
  return (data ?? []).map((e) => ({
    profileId: e.profile_id,
    kpiId: e.kpi_id,
    date: e.date,
    value: Number(e.value),
  }));
}

export type StoreTargetsRecord = StoreWeeklyTargets & {
  id: string;
  notes: string | null;
  confirmedAt: string | null;
  bestPerformerId: string | null;
  bestPerformerConfirmed: boolean;
};

export async function getStoreTargets(
  db: Db,
  weekStart: string,
): Promise<StoreTargetsRecord | null> {
  const { data } = await db
    .from("store_weekly_targets")
    .select("*")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (!data) return null;
  const n = (v: number | null) => Number(v ?? 0);
  return {
    id: data.id,
    totalHours: n(data.total_hours),
    vistaValueEur: n(data.vista_value_eur),
    vistaAvgPrice: n(data.vista_avg_price),
    vistaWo: n(data.vista_wo),
    solePieces: n(data.sole_pieces),
    soleValueEur: n(data.sole_value_eur),
    soleAvgPrice: n(data.sole_avg_price),
    notes: data.notes,
    confirmedAt: data.confirmed_at,
    bestPerformerId: data.best_performer_id,
    bestPerformerConfirmed: data.best_performer_confirmed,
  };
}

/** Obiettivi della settimana: profileId → kpiId → { target, overridden }. */
export async function getWeeklyTargets(db: Db, weekStart: string, profileIds?: string[]) {
  let query = db
    .from("weekly_targets")
    .select("profile_id, kpi_id, target, overridden")
    .eq("week_start", weekStart);
  if (profileIds) query = query.in("profile_id", profileIds);
  const { data } = await query;
  return (data ?? []).map((t) => ({
    profileId: t.profile_id,
    kpiId: t.kpi_id,
    target: Number(t.target),
    overridden: t.overridden,
  }));
}

export function targetsByPerson(rows: { profileId: string; kpiId: string; target: number }[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    out[r.profileId] ??= {};
    out[r.profileId][r.kpiId] = r.target;
  }
  return out;
}

export type WeekComment = {
  profileId: string;
  kpiId: string | null;
  body: string;
  published: boolean;
  updatedAt: string;
};

/** Commenti della settimana (per il dipendente RLS lascia passare solo i propri pubblicati). */
export async function getWeekComments(
  db: Db,
  weekStart: string,
  profileId?: string,
): Promise<WeekComment[]> {
  let query = db
    .from("weekly_comments")
    .select("profile_id, kpi_id, body, published, updated_at")
    .eq("week_start", weekStart);
  if (profileId) query = query.eq("profile_id", profileId);
  const { data } = await query;
  return (data ?? []).map((c) => ({
    profileId: c.profile_id,
    kpiId: c.kpi_id,
    body: c.body,
    published: c.published,
    updatedAt: c.updated_at,
  }));
}

/** Totali del negozio per voce (vista store_weekly_totals, visibile a tutti). */
export async function getStoreTotals(db: Db, weekStart: string): Promise<Record<string, number>> {
  const { data } = await db
    .from("store_weekly_totals")
    .select("kpi_id, total")
    .eq("week_start", weekStart);
  return Object.fromEntries((data ?? []).map((r) => [r.kpi_id!, Number(r.total ?? 0)]));
}

/* ------------------------------------------------------- dipendente */

export type MyWeek = {
  weekStart: string;
  weekNumber: number;
  days: string[];
  today: string;
  rows: SheetRow[];
  generalComment: string | null;
  note: string;
  filledDates: string[];
  store: {
    totals: Record<string, number>;
    targets: StoreTargetsRecord | null;
    bestPerformerName: string | null;
  };
  kpis: { kpiId: string; code: string; label: string }[];
};

/** Tutto ciò che serve alla pagina /obiettivi del dipendente (con la sua sessione: RLS). */
export async function getMyWeek(
  db: Db,
  profile: { id: string; home_zone: TargetZone },
  weekStart: string,
): Promise<MyWeek> {
  const days = weekDates(weekStart);
  const defs = await getKpiDefinitions(db);
  const [kpisByPerson, entries, targets, comments, { data: note }, totals, storeTargets] =
    await Promise.all([
      getPeopleKpis(db, [{ id: profile.id, zone: profile.home_zone }], defs),
      getEntries(db, days[0], days[6], [profile.id]),
      getWeeklyTargets(db, weekStart, [profile.id]),
      getWeekComments(db, weekStart, profile.id),
      db
        .from("employee_week_notes")
        .select("body")
        .eq("profile_id", profile.id)
        .eq("week_start", weekStart)
        .maybeSingle(),
      getStoreTotals(db, weekStart),
      getStoreTargets(db, weekStart),
    ]);
  const published = comments.filter((c) => c.published && c.body.trim());
  const kpis = kpisByPerson.get(profile.id) ?? [];
  // Voci con un obiettivo assegnato ma tolte dal foglio della persona: restano visibili.
  for (const t of targets) {
    if (kpis.some((k) => k.kpiId === t.kpiId)) continue;
    const d = defs.find((x) => x.id === t.kpiId);
    if (d)
      kpis.push({
        kpiId: d.id,
        code: d.code,
        label: d.label,
        labelOverride: null,
        sortOrder: 999,
        fromGroup: false,
      });
  }
  const rows = buildPersonSheet({
    days,
    kpis,
    entries,
    targets: targetsByPerson(targets)[profile.id] ?? {},
    comments: Object.fromEntries(published.filter((c) => c.kpiId).map((c) => [c.kpiId!, c.body])),
  });

  let bestPerformerName: string | null = null;
  if (storeTargets?.bestPerformerConfirmed && storeTargets.bestPerformerId) {
    const { data: p } = await db
      .from("public_profiles")
      .select("display_name")
      .eq("id", storeTargets.bestPerformerId)
      .maybeSingle();
    bestPerformerName = p?.display_name ?? null;
  }

  return {
    weekStart,
    weekNumber: weekNumber(parseISO(weekStart)),
    days,
    today: toISODate(nowInRome()),
    rows,
    generalComment: published.find((c) => c.kpiId === null)?.body ?? null,
    note: note?.body ?? "",
    filledDates: [...new Set(entries.map((e) => e.date))],
    store: { totals, targets: storeTargets, bestPerformerName },
    kpis: defs.filter((d) => d.active).map((d) => ({ kpiId: d.id, code: d.code, label: d.label })),
  };
}

export type MyWeekSummaryItem = {
  kpiId: string;
  code: string;
  label: string;
  done: number;
  target: number | null;
  remaining: number | null;
  reached: boolean;
  /** Avanzamento 0…1 per la barra. */
  ratio: number;
};

export type MyWeekSummary = {
  weekStart: string;
  weekNumber: number;
  /** Le 3–4 voci principali (prima quelle con un obiettivo, nell'ordine del foglio). */
  items: MyWeekSummaryItem[];
  /** Ha almeno un obiettivo assegnato in settimana. */
  hasTargets: boolean;
  /** Oggi ha già salvato almeno un numero ("Compila oggi" in evidenza se false). */
  filledToday: boolean;
  /** Link alla compilazione. */
  href: string;
};

/**
 * Riepilogo per la card della Home "I miei obiettivi della settimana" (§6.1).
 * Usa il client con la sessione dell'utente (RLS: solo i propri dati).
 */
export async function getMyWeekSummary(
  db: Db,
  profileId: string,
  weekStart: string = toISODate(mondayOf(nowInRome())),
  limit = 4,
): Promise<MyWeekSummary> {
  const today = toISODate(nowInRome());
  const days = weekDates(weekStart);
  const { data: me } = await db
    .from("public_profiles")
    .select("home_zone")
    .eq("id", profileId)
    .maybeSingle();
  const zone = (me?.home_zone ?? "vista") as TargetZone;
  const [kpisByPerson, entries, targets, { count }] = await Promise.all([
    getPeopleKpis(db, [{ id: profileId, zone }]),
    getEntries(db, days[0], days[6], [profileId]),
    getWeeklyTargets(db, weekStart, [profileId]),
    db
      .from("daily_entries")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("date", today),
  ]);
  const rows = buildPersonSheet({
    days,
    kpis: kpisByPerson.get(profileId) ?? [],
    entries,
    targets: targetsByPerson(targets)[profileId] ?? {},
  });
  const withTarget = rows.filter((r) => r.target !== null && r.target > 0);
  const chosen = (withTarget.length ? withTarget : rows).slice(0, limit);
  return {
    weekStart,
    weekNumber: weekNumber(parseISO(weekStart)),
    items: chosen.map((r) => ({
      kpiId: r.kpiId,
      code: r.code,
      label: r.label,
      done: r.done,
      target: r.target,
      remaining: r.remaining,
      reached: r.reached,
      ratio: r.ratio,
    })),
    hasTargets: withTarget.length > 0,
    filledToday: (count ?? 0) > 0,
    href: "/obiettivi",
  };
}

/* ----------------------------------------------- chi non ha compilato */

/**
 * Persone con un turno di lavoro PUBBLICATO nelle date indicate che non hanno salvato nessun
 * numero quel giorno. Va chiamata con un client che legge tutte le daily_entries: un admin
 * (Monitoraggio) o il service role (cron del promemoria delle 19:30).
 */
export async function getMissingCompilers(db: Db, dates: string[]): Promise<MissingByDay[]> {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const [{ data: shifts }, { data: filled }] = await Promise.all([
    db
      .from("published_shifts")
      .select("profile_id, date, start_time, is_absence")
      .gte("date", from)
      .lte("date", to),
    db.from("daily_entries").select("profile_id, date").gte("date", from).lte("date", to),
  ]);
  return missingCompilers({
    dates,
    onShift: (shifts ?? [])
      .filter((s) => !s.is_absence && s.start_time && s.profile_id && s.date)
      .map((s) => ({ profileId: s.profile_id!, date: s.date! })),
    filled: (filled ?? []).map((f) => ({ profileId: f.profile_id, date: f.date })),
  });
}

/* ------------------------------------------------------------- admin */

export type AdminTargetsPerson = {
  profileId: string;
  name: string;
  color: string | null;
  zone: TargetZone;
  plannedHours: number;
  hasShifts: boolean;
  kpis: PersonKpi[];
};

export type AdminTargetsWeek = {
  weekStart: string;
  weekNumber: number;
  days: string[];
  today: string;
  definitions: KpiDefinition[];
  sets: KpiSet[];
  people: AdminTargetsPerson[];
  /** Somma delle ore pianificate (non in back office) delle persone: proposta delle ore totali. */
  plannedTotal: number;
  scheduleStatus: "draft" | "published" | null;
  store: StoreTargetsRecord | null;
  targets: { profileId: string; kpiId: string; target: number; overridden: boolean }[];
  entries: EntryValue[];
  comments: WeekComment[];
  notes: Record<string, string>;
};

/**
 * Dati della settimana per /admin/obiettivi (client dell'admin). Le ore vengono dai turni di
 * LAVORO (tabella shifts), escluse le ore in back office; non crea la settimana dei turni.
 */
export async function getAdminTargetsWeek(db: Db, weekStart: string): Promise<AdminTargetsWeek> {
  const days = weekDates(weekStart);
  const [schedulePeople, definitions, sets, { data: week }] = await Promise.all([
    getSchedulePeople(db),
    getKpiDefinitions(db),
    getKpiSets(db),
    db.from("schedule_weeks").select("id, status").eq("week_start", weekStart).maybeSingle(),
  ]);
  const { data: shiftRows } = week
    ? await db.from("shifts").select("*").eq("week_id", week.id)
    : { data: [] };
  const shifts = (shiftRows ?? []).map(toShiftRecord);
  const hours = countedHoursByPerson(shifts, schedulePeople);
  const withShifts = new Set(shifts.filter((s) => s.start).map((s) => s.profileId));

  const [kpisByPerson, store, targets, entries, comments, { data: notes }] = await Promise.all([
    getPeopleKpis(
      db,
      schedulePeople.map((p) => ({ id: p.id, zone: p.homeZone })),
      definitions,
      sets,
    ),
    getStoreTargets(db, weekStart),
    getWeeklyTargets(db, weekStart),
    getEntries(db, days[0], days[6]),
    getWeekComments(db, weekStart),
    db.from("employee_week_notes").select("profile_id, body").eq("week_start", weekStart),
  ]);

  const people = schedulePeople.map((p): AdminTargetsPerson => ({
    profileId: p.id,
    name: p.displayName,
    color: p.color,
    zone: p.homeZone,
    plannedHours: Math.round((hours.get(p.id) ?? 0) * 100) / 100,
    hasShifts: withShifts.has(p.id),
    kpis: kpisByPerson.get(p.id) ?? [],
  }));

  return {
    weekStart,
    weekNumber: weekNumber(parseISO(weekStart)),
    days,
    today: toISODate(nowInRome()),
    definitions,
    sets,
    people,
    plannedTotal: Math.round([...hours.values()].reduce((a, b) => a + b, 0) * 100) / 100,
    scheduleStatus: week?.status ?? null,
    store,
    targets,
    entries,
    comments,
    notes: Object.fromEntries((notes ?? []).map((n) => [n.profile_id, n.body])),
  };
}
