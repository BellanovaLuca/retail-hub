/**
 * Assegnazione obiettivi "semplice": la tabella con tutte le persone in cui si scrive a mano cosa
 * deve fare ciascuno. Il calcolo dalla produttività oraria (WO e pezzi sole dalle ore) è
 * facoltativo e si attiva solo inserendo i valori del negozio.
 */
import type { DefaultTargetRule, StoreWeeklyTargets } from "@/lib/targets";

/** Il calcolo automatico è attivo se c'è un generato vista o un valore sole del negozio. */
export function isCalculationOn(store: Pick<StoreWeeklyTargets, "vistaValueEur" | "soleValueEur">) {
  return store.vistaValueEur > 0 || store.soleValueEur > 0;
}

/**
 * Voci per l'anteprima: senza calcolo automatico le voci a regola `assignment` (WO, pezzi sole)
 * non propongono nulla (si scrivono a mano); le regole fisse e le "% di …" restano.
 */
export function assignmentKpisFor<K extends { defaultTargetRule: DefaultTargetRule }>(
  kpis: K[],
  calculationOn: boolean,
): K[] {
  if (calculationOn) return kpis;
  return kpis.map((k) =>
    k.defaultTargetRule?.type === "assignment" ? { ...k, defaultTargetRule: null } : k,
  );
}

type SheetPerson = { profileId: string; kpis: { kpiId: string }[] };

/** Voci con un obiettivo salvato ma fuori dal foglio della persona (profileId → kpiId). */
export function extraKpisFromSaved(
  people: SheetPerson[],
  saved: { profileId: string; kpiId: string }[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of people) {
    const own = new Set(p.kpis.map((k) => k.kpiId));
    const extra = saved
      .filter((t) => t.profileId === p.profileId && !own.has(t.kpiId))
      .map((t) => t.kpiId);
    if (extra.length) out[p.profileId] = [...new Set(extra)];
  }
  return out;
}

/** Aggiunge alle voci di ciascuno quelle scritte fuori dal suo foglio (in fondo). */
export function withExtraKpis<
  P extends { profileId: string; kpis: { kpiId: string; code: string; label: string }[] },
>(
  people: P[],
  extra: Record<string, string[]>,
  kpis: { kpiId: string; code: string; label: string }[],
): P[] {
  const byId = new Map(kpis.map((k) => [k.kpiId, k]));
  return people.map((p) => {
    const add = (extra[p.profileId] ?? [])
      .filter((id) => !p.kpis.some((k) => k.kpiId === id))
      .map((id) => byId.get(id))
      .filter((k): k is { kpiId: string; code: string; label: string } => Boolean(k))
      .map((k) => ({ kpiId: k.kpiId, code: k.code, label: k.label }));
    return add.length ? { ...p, kpis: [...p.kpis, ...add] } : p;
  });
}
