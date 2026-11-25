/**
 * Tabella di anteprima dell'"Assegnazione obiettivi" (§8.3): ore pianificate per persona,
 * obiettivi calcolati con `assignWeeklyTargets`, sovrascritture manuali e totali assegnati.
 */
import { toMinutes } from "@/lib/domain/time";
import { resolveBackOffice } from "@/lib/schedule/cells";
import type { SchedulePerson, ShiftRecord } from "@/lib/schedule/types";
import {
  assignWeeklyTargets,
  type KpiDefinitionRef,
  type StoreWeeklyTargets,
  type TargetAssignment,
  type TargetZone,
} from "@/lib/targets";

/**
 * Ore pianificate che contano per gli obiettivi: ore dei turni in vendita meno le pause della
 * giornata, escluse quelle in back office (chi è in back office non è in vendita, §7.1).
 * Le assenze non hanno orario e non contano.
 */
export function countedHoursByPerson(
  shifts: Pick<
    ShiftRecord,
    "profileId" | "date" | "start" | "end" | "breakMinutes" | "isBackOffice"
  >[],
  people: SchedulePerson[],
): Map<string, number> {
  const byId = new Map(people.map((p) => [p.id, p]));
  // Per giornata: minuti in vendita e pause. La pausa non ha una posizione nella giornata e si
  // toglie dal tempo in vendita, anche se è registrata sul pezzo in back office (es. chi apre).
  const days = new Map<string, { profileId: string; sale: number; pause: number }>();
  for (const s of shifts) {
    if (!s.start || !s.end) continue;
    const k = `${s.profileId}|${s.date}`;
    const day = days.get(k) ?? { profileId: s.profileId, sale: 0, pause: 0 };
    day.pause += s.breakMinutes ?? 0;
    if (!resolveBackOffice(s, byId.get(s.profileId)))
      day.sale += Math.max(0, toMinutes(s.end) - toMinutes(s.start));
    days.set(k, day);
  }
  const out = new Map<string, number>();
  for (const day of days.values()) {
    if (day.sale === 0) continue;
    const h = Math.max(0, day.sale - day.pause) / 60;
    out.set(day.profileId, (out.get(day.profileId) ?? 0) + h);
  }
  return out;
}

export type AssignmentPerson = {
  profileId: string;
  name: string;
  zone: TargetZone;
  plannedHours: number;
  /** Voci della persona, nell'ordine del suo foglio. */
  kpis: { kpiId: string; code: string; label: string }[];
};

/** Chiave di una cella dell'anteprima. */
export const cellKey = (profileId: string, kpiId: string) => `${profileId}|${kpiId}`;

export type PreviewCell = {
  /** Valore proposto dal calcolo (null = la voce non ha una regola). */
  computed: number | null;
  /** Valore finale (sovrascritto o calcolato). */
  value: number | null;
  overridden: boolean;
};

export type AssignmentPreview = {
  assignment: TargetAssignment;
  cells: Map<string, PreviewCell>;
  /** Somma dei valori finali per voce (kpiId). */
  assignedByKpi: Record<string, number>;
  woAssigned: number;
  solePiecesAssigned: number;
};

/**
 * Calcola l'anteprima: proposta automatica + sovrascritture (`overrides`, per chiave cella;
 * null = cella svuotata a mano). Una sovrascrittura uguale a ciò che il calcolo mostrerebbe senza
 * di lei non è più "sovrascritta".
 */
export function buildAssignmentPreview(input: {
  store: StoreWeeklyTargets;
  people: AssignmentPerson[];
  kpis: (KpiDefinitionRef & { kpiId: string })[];
  overrides: Record<string, number | null>;
}): AssignmentPreview {
  const targetPeople = input.people.map((p) => ({
    profileId: p.profileId,
    zone: p.zone,
    plannedHours: p.plannedHours,
    kpiCodes: p.kpis.map((k) => k.code),
  }));
  // Proposta "pulita" (per mostrare da dove si parte) e proposta effettiva, in cui le voci
  // "% di …" seguono i valori scritti a mano della voce base.
  const assignment = assignWeeklyTargets(input.store, targetPeople, input.kpis);
  const byCode: Record<string, Record<string, number>> = {};
  for (const p of input.people) {
    for (const k of p.kpis) {
      const v = input.overrides[cellKey(p.profileId, k.kpiId)];
      if (typeof v === "number") (byCode[p.profileId] ??= {})[k.code] = v;
    }
  }
  const effective = assignWeeklyTargets(input.store, targetPeople, input.kpis, byCode);
  const byPerson = new Map(assignment.people.map((p) => [p.profileId, p]));
  const effectiveByPerson = new Map(effective.people.map((p) => [p.profileId, p]));
  const cells = new Map<string, PreviewCell>();
  const assignedByKpi: Record<string, number> = {};
  let woAssigned = 0;
  let solePiecesAssigned = 0;

  const targetById = new Map(targetPeople.map((p) => [p.profileId, p]));
  /** Valore che la cella avrebbe senza la propria correzione (con le altre della persona). */
  const proposalWithout = (profileId: string, code: string, computed: number | null) => {
    const others = { ...(byCode[profileId] ?? {}) };
    delete others[code];
    if (Object.keys(others).length === 0) return computed;
    const targets = assignWeeklyTargets(input.store, [targetById.get(profileId)!], input.kpis, {
      [profileId]: others,
    }).people[0].targets;
    return code in targets ? targets[code] : null;
  };

  for (const person of input.people) {
    const computedTargets = byPerson.get(person.profileId)?.targets ?? {};
    const effectiveTargets = effectiveByPerson.get(person.profileId)?.targets ?? {};
    for (const k of person.kpis) {
      const key = cellKey(person.profileId, k.kpiId);
      const computed = k.code in computedTargets ? computedTargets[k.code] : null;
      const manual = key in input.overrides ? input.overrides[key] : undefined;
      // "Sovrascritta" = diversa da ciò che il calcolo mostrerebbe senza questa correzione: così
      // un valore scritto a mano resta tale anche se coincide con la proposta di partenza ma non
      // con quella effettiva (es. Doppi = 3 dopo aver portato i WO da 16 a 20).
      const hasOverride =
        manual === undefined
          ? false
          : manual === null
            ? computed !== null
            : manual !== proposalWithout(person.profileId, k.code, computed);
      const value = hasOverride
        ? (manual as number | null)
        : k.code in effectiveTargets
          ? effectiveTargets[k.code]
          : computed;
      cells.set(key, { computed, value, overridden: hasOverride });
      if (value !== null) {
        assignedByKpi[k.kpiId] = (assignedByKpi[k.kpiId] ?? 0) + value;
        if (k.code === "WO") woAssigned += value;
        if (k.code === "PZ_SOLE" && person.zone === "sole") solePiecesAssigned += value;
      }
    }
  }
  return { assignment, cells, assignedByKpi, woAssigned, solePiecesAssigned };
}

/**
 * Sovrascritture da ripristinare partendo da obiettivi già salvati: le celle salvate come
 * `overridden` e quelle di voci senza regola (scritte a mano). Le altre si ricalcolano, così
 * un cambio dei turni aggiorna la proposta.
 */
export function overridesFromSaved(
  saved: { profileId: string; kpiId: string; target: number; overridden: boolean }[],
  computed: Map<string, PreviewCell>,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const s of saved) {
    const key = cellKey(s.profileId, s.kpiId);
    const c = computed.get(key);
    if (!c) continue;
    if (s.overridden || c.computed === null) out[key] = s.target;
  }
  return out;
}

/**
 * Importo o numero digitato all'italiana: "45.000" e "45000" → 45000, "410,50" → 410.5,
 * "2.5" → 2.5. Vuoto → 0. Testo non valido o negativo → null.
 */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/[\s€]/g, "");
  if (t === "") return 0;
  let normalized: string;
  // Migliaia all'italiana ("45.000", "1.234,5"); "0.125" invece è un decimale col punto.
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t))
    normalized = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(t)) normalized = t.replace(",", ".");
  else if (/^\d+(\.\d+)?$/.test(t)) normalized = t;
  else return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Numero all'italiana con i separatori delle migliaia (per i campi del form). */
export function formatAmount(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

/** €/ora con due decimali, all'italiana. */
export function formatEurPerHour(n: number): string {
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h`;
}
