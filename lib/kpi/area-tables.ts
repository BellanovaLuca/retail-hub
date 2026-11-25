/**
 * Assegnazione obiettivi divisa per area: una tabella per il Vista (con i jolly) e una per il Sole,
 * ciascuna con le voci del proprio gruppo. Le voci dell'altra area si possono mostrare per dare
 * obiettivi «misti». I valori sono solo quelli scritti dall'admin: le proposte automatiche si
 * applicano su richiesta alle celle vuote.
 */
import { buildAssignmentPreview, cellKey, type AssignmentPerson } from "@/lib/kpi/assignment";
import { assignmentKpisFor, isCalculationOn } from "@/lib/kpi/simple-assignment";
import type { DefaultTargetRule, StoreWeeklyTargets, TargetZone } from "@/lib/targets";

export type Area = "vista" | "sole";

export const AREA_LABEL: Record<Area, string> = { vista: "Vista", sole: "Sole" };

/** I jolly stanno con il Vista (§8.3). */
export function areaOf(zone: TargetZone): Area {
  return zone === "sole" ? "sole" : "vista";
}

export type AreaKpi = { kpiId: string; code: string; label: string };
export type AreaSet = {
  id: string;
  name: string;
  items: { kpiId: string; labelOverride: string | null; sortOrder: number }[];
};
export type AreaColumn = AreaKpi & {
  /** Voce dell'altra area, mostrata per gli obiettivi misti. */
  mixed: boolean;
};

const setFor = (sets: AreaSet[], area: Area) => sets.find((s) => s.name === AREA_LABEL[area]);

/** Voci del gruppo dell'area, nell'ordine del gruppo e con la sua etichetta. */
export function areaSheet(sets: AreaSet[], kpis: AreaKpi[], area: Area): AreaKpi[] {
  const byId = new Map(kpis.map((k) => [k.kpiId, k]));
  return [...(setFor(sets, area)?.items ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((i) => {
      const k = byId.get(i.kpiId);
      return k ? [{ kpiId: k.kpiId, code: k.code, label: i.labelOverride || k.label }] : [];
    });
}

/**
 * Colonne della tabella di un'area: prima le voci del suo gruppo, poi (se richiesto, o se
 * qualcuno dell'area ha già un valore lì) le altre voci attive come colonne «miste».
 */
export function areaColumns(input: {
  area: Area;
  sets: AreaSet[];
  kpis: AreaKpi[];
  showMixed: boolean;
  /** Voci in cui almeno una persona dell'area ha un valore. */
  usedKpiIds: Set<string>;
}): AreaColumn[] {
  const own = areaSheet(input.sets, input.kpis, input.area);
  const ownIds = new Set(own.map((k) => k.kpiId));
  const mixed = input.kpis.filter(
    (k) => !ownIds.has(k.kpiId) && (input.showMixed || input.usedKpiIds.has(k.kpiId)),
  );
  return [
    ...own.map((k) => ({ ...k, mixed: false })),
    ...mixed.map((k) => ({ kpiId: k.kpiId, code: k.code, label: k.label, mixed: true })),
  ];
}

/**
 * «Proponi in automatico»: riempie le celle VUOTE delle voci dell'area di ciascuno con la proposta
 * (regole fisse, «% di …» sui valori già scritti, WO e pezzi sole dal calcolo se ci sono i valori
 * del negozio). Non tocca mai una cella già scritta. Restituisce i valori aggiornati e quante
 * celle ha riempito.
 */
export function fillProposals(input: {
  store: StoreWeeklyTargets;
  people: { profileId: string; name: string; zone: TargetZone; plannedHours: number }[];
  kpis: (AreaKpi & { defaultTargetRule: DefaultTargetRule })[];
  sets: AreaSet[];
  values: Record<string, number>;
}): { values: Record<string, number>; filled: number } {
  const sheets = {
    vista: areaSheet(input.sets, input.kpis, "vista"),
    sole: areaSheet(input.sets, input.kpis, "sole"),
  };
  const people: AssignmentPerson[] = input.people.map((p) => ({
    ...p,
    kpis: sheets[areaOf(p.zone)],
  }));
  const preview = buildAssignmentPreview({
    store: input.store,
    people,
    kpis: assignmentKpisFor(input.kpis, isCalculationOn(input.store)),
    overrides: input.values,
  });
  const values = { ...input.values };
  let filled = 0;
  for (const p of people) {
    for (const k of p.kpis) {
      const key = cellKey(p.profileId, k.kpiId);
      const v = preview.cells.get(key)?.value;
      if (!(key in values) && typeof v === "number") {
        values[key] = v;
        filled++;
      }
    }
  }
  return { values, filled };
}

/**
 * Voce che corrisponde a un nome scritto a mano (senza badare a maiuscole e spazi ai bordi): per
 * etichetta propria o per l'etichetta che ha in un gruppo. Se più voci corrispondono vince, in
 * ordine: quella con quel nome nel gruppo di destinazione, quella con quell'etichetta propria,
 * quella che si chiama così in un altro gruppo.
 */
export function findKpiByName<K extends { id: string; label: string }>(
  name: string,
  kpis: K[],
  items: { set_id: string; kpi_id: string; label_override: string | null }[],
  targetSetId: string,
): K | undefined {
  const wanted = name.trim().toLowerCase();
  const named = (i: { label_override: string | null }) =>
    (i.label_override ?? "").trim().toLowerCase() === wanted;
  const byId = new Map(kpis.map((k) => [k.id, k]));
  const here = items.find((i) => i.set_id === targetSetId && named(i));
  const elsewhere = items.find((i) => i.set_id !== targetSetId && named(i));
  return (
    (here && byId.get(here.kpi_id)) ||
    kpis.find((k) => k.label.trim().toLowerCase() === wanted) ||
    (elsewhere && byId.get(elsewhere.kpi_id)) ||
    undefined
  );
}
