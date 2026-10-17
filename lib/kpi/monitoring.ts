/**
 * Monitoraggio della settimana (§8.3): totali del negozio vs obiettivo, tabelle per persona
 * (META divisa Vista / Sole, NUANCE), best performer e chi non ha compilato la giornata.
 */
import type { StoreWeeklyTargets, TargetZone, PerformerInput } from "@/lib/targets";
import type { EntryValue } from "./sheet";

export type MonitoringKpi = { kpiId: string; code: string; label: string };

/** Voci mostrate per prime nei totali del negozio (le altre seguono, se hanno numeri o obiettivi). */
export const HEADLINE_CODES = ["WO", "PZ_SOLE", "META_RB_OO", "NUANCE"] as const;

export type StoreTotalRow = MonitoringKpi & {
  done: number;
  /** Obiettivo del negozio: WO e pezzi sole dall'Assegnazione, le altre voci = somma assegnata. */
  target: number | null;
  targetSource: "negozio" | "assegnati" | null;
};

export function storeTotalsRows(input: {
  kpis: MonitoringKpi[];
  totals: Record<string, number>;
  assigned?: Record<string, number>;
  store: Pick<StoreWeeklyTargets, "vistaWo" | "solePieces"> | null;
  /** Solo le voci principali (card "Negozio" del dipendente). */
  headlineOnly?: boolean;
}): StoreTotalRow[] {
  const headline = new Set<string>(HEADLINE_CODES);
  const rows = input.kpis.map((k): StoreTotalRow => {
    const done = input.totals[k.kpiId] ?? 0;
    if (k.code === "WO" && input.store?.vistaWo)
      return { ...k, done, target: input.store.vistaWo, targetSource: "negozio" };
    if (k.code === "PZ_SOLE" && input.store?.solePieces)
      return { ...k, done, target: input.store.solePieces, targetSource: "negozio" };
    const assigned = input.assigned?.[k.kpiId];
    return assigned
      ? { ...k, done, target: assigned, targetSource: "assegnati" }
      : { ...k, done, target: null, targetSource: null };
  });
  const order = (code: string) => {
    const i = (HEADLINE_CODES as readonly string[]).indexOf(code);
    return i === -1 ? HEADLINE_CODES.length : i;
  };
  return rows
    .filter((r) =>
      input.headlineOnly ? headline.has(r.code) : headline.has(r.code) || r.done > 0 || r.target,
    )
    .sort((a, b) => order(a.code) - order(b.code));
}

export type ZonePerson = { profileId: string; name: string; zone: TargetZone };

export type ZoneTableRow = {
  profileId: string;
  name: string;
  values: Record<string, number>;
  total: number;
  target: number | null;
};

export type ZoneTableGroup = {
  zone: "vista" | "sole";
  label: string;
  rows: ZoneTableRow[];
  total: number;
  target: number;
};

export type ZoneTable = { groups: ZoneTableGroup[]; total: number; target: number };

/**
 * Tabella per persona di una voce (es. META) nei giorni della settimana, divisa per area:
 * Vista (con i jolly) e Sole, con i totali di gruppo e generale. Compare chi ha la voce
 * tra le sue o ha inserito numeri.
 */
export function zoneTable(input: {
  people: ZonePerson[];
  kpiId: string;
  days: string[];
  entries: EntryValue[];
  targets: Record<string, Record<string, number>>;
  /** Persone che hanno la voce nel proprio foglio. */
  holders: Set<string>;
}): ZoneTable {
  const rows: (ZoneTableRow & { zone: "vista" | "sole" })[] = [];
  for (const p of input.people) {
    const mine = input.entries.filter(
      (e) => e.profileId === p.profileId && e.kpiId === input.kpiId,
    );
    if (!input.holders.has(p.profileId) && mine.length === 0) continue;
    const values: Record<string, number> = {};
    for (const d of input.days) values[d] = 0;
    for (const e of mine) if (e.date in values) values[e.date] += e.value;
    const total = Object.values(values).reduce((a, b) => a + b, 0);
    const target = input.targets[p.profileId]?.[input.kpiId] ?? null;
    rows.push({
      profileId: p.profileId,
      name: p.name,
      values,
      total,
      target,
      zone: p.zone === "sole" ? "sole" : "vista",
    });
  }
  const groups = (["vista", "sole"] as const)
    .map((zone): ZoneTableGroup => {
      const list = rows.filter((r) => r.zone === zone).map(({ zone: _z, ...r }) => r);
      return {
        zone,
        label: zone === "vista" ? "Vista" : "Sole",
        rows: list,
        total: list.reduce((s, r) => s + r.total, 0),
        target: list.reduce((s, r) => s + (r.target ?? 0), 0),
      };
    })
    .filter((g) => g.rows.length > 0);
  return {
    groups,
    total: groups.reduce((s, g) => s + g.total, 0),
    target: groups.reduce((s, g) => s + g.target, 0),
  };
}

/** Somma per persona e voce dei numeri della settimana. */
export function totalsByPerson(entries: EntryValue[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (!e.profileId) continue;
    out[e.profileId] ??= {};
    out[e.profileId][e.kpiId] = (out[e.profileId][e.kpiId] ?? 0) + e.value;
  }
  return out;
}

/** Ingressi per `bestPerformer`: ogni voce con obiettivo, con quanto fatto in settimana. */
export function performerInputs(
  targets: Record<string, Record<string, number>>,
  entries: EntryValue[],
): PerformerInput[] {
  const done = totalsByPerson(entries);
  return Object.entries(targets).map(([profileId, byKpi]) => ({
    profileId,
    items: Object.entries(byKpi).map(([kpiId, target]) => ({
      target,
      done: done[profileId]?.[kpiId] ?? 0,
    })),
  }));
}

/** Percentuale media di raggiungimento (come `bestPerformer`), per la classifica. */
export function averageAchievement(p: PerformerInput): number | null {
  const items = p.items.filter((i) => i.target > 0);
  if (items.length === 0) return null;
  return items.reduce((s, i) => s + i.done / i.target, 0) / items.length;
}

export type MissingByDay = { date: string; profileIds: string[] };

/**
 * Chi non ha compilato: per ogni data, le persone con un turno di lavoro pubblicato (non assenza)
 * che non hanno salvato nessun numero quel giorno. Serve al Monitoraggio e al promemoria serale.
 */
export function missingCompilers(input: {
  dates: string[];
  onShift: { profileId: string; date: string }[];
  filled: { profileId: string; date: string }[];
}): MissingByDay[] {
  const filled = new Set(input.filled.map((f) => `${f.profileId}|${f.date}`));
  return input.dates.map((date) => ({
    date,
    profileIds: [
      ...new Set(
        input.onShift
          .filter((s) => s.date === date && !filled.has(`${s.profileId}|${date}`))
          .map((s) => s.profileId),
      ),
    ],
  }));
}

/** Testo del link "Citalo in una comunicazione". */
export function bestPerformerAnnouncementTitle(weekNumber: number, name: string): string {
  return `Best performer della Week ${weekNumber}: ${name}`;
}
