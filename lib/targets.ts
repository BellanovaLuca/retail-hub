/**
 * Assegnazione degli obiettivi settimanali (§8.3, foglio "Assegnazione obiettivi"),
 * avanzamento "a quanto sei / quanto mi manca" e best performer.
 *
 * - €/ora vista = generato vista ÷ ore totali; €/ora sole = valore sole ÷ ore totali (0 se ore = 0).
 * - Persone Vista e Jolly: valore WO = €/ora vista × ore pianificate; WO = round(valore ÷ PM vista).
 * - Persone Sole: valore sole = €/ora sole × ore; pezzi sole = round(valore ÷ PM sole).
 * - Voci con regola `assignment`: WO → WO calcolato; PZ_SOLE → pezzi calcolati per chi è in Sole,
 *   fisso 1 per Vista e Jolly ("Pz sole x ADV").
 * - Voci `pct_of`: round(base × pct), ma almeno 1 se la base è > 0 (0 se la base è 0).
 * - Voci `fixed`: il valore. Voci senza regola: nessun obiettivo proposto (lo scrive l'admin).
 * - Chi non ha ore in vendita in settimana non riceve proposte automatiche: solo i valori scritti
 *   a mano (e le voci "% di …" calcolate su quelli).
 */

export type StoreWeeklyTargets = {
  totalHours: number;
  vistaValueEur: number;
  vistaAvgPrice: number;
  vistaWo: number;
  solePieces: number;
  soleValueEur: number;
  soleAvgPrice: number;
};

export type TargetZone = "vista" | "sole" | "jolly";

export type TargetPerson = {
  profileId: string;
  zone: TargetZone;
  plannedHours: number;
  kpiCodes: string[];
};

export type DefaultTargetRule =
  | { type: "pct_of"; kpi: string; pct: number }
  | { type: "fixed"; value: number }
  | { type: "assignment" }
  | null;

export type KpiDefinitionRef = { code: string; defaultTargetRule: DefaultTargetRule };

export type PersonTargets = {
  profileId: string;
  valueWo: number;
  woTarget: number;
  valueSole: number;
  soleTarget: number;
  /** Obiettivo proposto per ciascuna voce della persona (solo voci con una regola). */
  targets: Record<string, number>;
};

export type TargetAssignment = {
  eurPerHourVista: number;
  eurPerHourSole: number;
  people: PersonTargets[];
  totals: {
    hoursAssigned: number;
    hoursTarget: number;
    woAssigned: number;
    woTarget: number;
    solePiecesAssigned: number;
    solePiecesTarget: number;
    /** Somma degli obiettivi assegnati per voce. */
    byKpi: Record<string, number>;
  };
};

/** "Pz sole x ADV": obiettivo fisso di pezzi sole per chi lavora in Vista. */
export const PZ_SOLE_VISTA_FIXED = 1;

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Calcola gli obiettivi proposti per ogni persona e i totali assegnati. */
export function assignWeeklyTargets(
  store: StoreWeeklyTargets,
  people: TargetPerson[],
  kpis: KpiDefinitionRef[],
  /** Valori scritti a mano (profileId → codice voce → valore): base per le voci "% di …". */
  overrides: Record<string, Record<string, number>> = {},
): TargetAssignment {
  const eurPerHourVista = safeDiv(store.vistaValueEur, store.totalHours);
  const eurPerHourSole = safeDiv(store.soleValueEur, store.totalHours);
  const rules = new Map(kpis.map((k) => [k.code, k.defaultTargetRule]));

  const result = people.map((p): PersonTargets => {
    const hours = Math.max(0, p.plannedHours);
    const working = hours > 0;
    const isSole = p.zone === "sole";
    const valueWo = isSole ? 0 : eurPerHourVista * hours;
    const woTarget = Math.round(safeDiv(valueWo, store.vistaAvgPrice));
    const valueSole = isSole ? eurPerHourSole * hours : 0;
    const soleTarget = Math.round(safeDiv(valueSole, store.soleAvgPrice));

    const cache = new Map<string, number | null>();
    const manual = overrides[p.profileId] ?? {};
    const compute = (code: string, visiting: Set<string>): number | null => {
      if (cache.has(code)) return cache.get(code)!;
      if (visiting.has(code)) return null; // ciclo tra regole pct_of
      if (code in manual) {
        cache.set(code, manual[code]);
        return manual[code];
      }
      const rule = rules.get(code);
      let value: number | null = null;
      if (rule?.type === "fixed") value = working ? rule.value : null;
      else if (rule?.type === "assignment") {
        if (!working) value = null;
        else if (code === "WO") value = woTarget;
        else if (code === "PZ_SOLE") value = isSole ? soleTarget : PZ_SOLE_VISTA_FIXED;
      } else if (rule?.type === "pct_of") {
        const raw = compute(rule.kpi, new Set([...visiting, code]));
        const base = raw ?? 0;
        value =
          !working && raw === null ? null : base > 0 ? Math.max(1, Math.round(base * rule.pct)) : 0;
      }
      cache.set(code, value);
      return value;
    };

    const targets: Record<string, number> = {};
    for (const code of p.kpiCodes) {
      const v = compute(code, new Set());
      if (v !== null) targets[code] = v;
    }
    return { profileId: p.profileId, valueWo, woTarget, valueSole, soleTarget, targets };
  });

  const byKpi: Record<string, number> = {};
  for (const r of result)
    for (const [k, v] of Object.entries(r.targets)) byKpi[k] = (byKpi[k] ?? 0) + v;

  return {
    eurPerHourVista,
    eurPerHourSole,
    people: result,
    totals: {
      hoursAssigned: people.reduce((s, p) => s + Math.max(0, p.plannedHours), 0),
      hoursTarget: store.totalHours,
      woAssigned: result.reduce((s, r) => s + r.woTarget, 0),
      woTarget: store.vistaWo,
      solePiecesAssigned: result.reduce((s, r) => s + r.soleTarget, 0),
      solePiecesTarget: store.solePieces,
      byKpi,
    },
  };
}

export type WeekProgress = {
  /** "A quanto sei": somma lun→dom. */
  done: number;
  /** "Quanto mi manca": obiettivo − somma, mai sotto zero. */
  remaining: number;
  /** "Obiettivo raggiunto ✓" quando la somma arriva all'obiettivo. */
  reached: boolean;
};

/** Avanzamento della settimana su una voce. Con obiettivo ≤ 0 la voce risulta raggiunta. */
export function weekProgress(
  entries: (number | { value: number })[],
  target: number,
): WeekProgress {
  const done = entries.reduce<number>((s, e) => s + (typeof e === "number" ? e : e.value), 0);
  return { done, remaining: Math.max(0, target - done), reached: done >= target };
}

export type PerformerInput = {
  profileId: string;
  items: { target: number; done: number }[];
};

export type BestPerformer = { profileId: string; averagePct: number; reachedCount: number };

/**
 * Best performer della settimana: media delle percentuali di raggiungimento (done ÷ target, NON
 * plafonate a 100%) sulle voci con obiettivo > 0. A parità vince chi ha più voci raggiunte; a
 * ulteriore parità il primo nell'ordine dato. Chi non ha obiettivi è ignorato; nessuno → null.
 */
export function bestPerformer(people: PerformerInput[]): BestPerformer | null {
  let best: BestPerformer | null = null;
  for (const p of people) {
    const items = p.items.filter((i) => i.target > 0);
    if (items.length === 0) continue;
    const averagePct = items.reduce((s, i) => s + i.done / i.target, 0) / items.length;
    const reachedCount = items.filter((i) => i.done >= i.target).length;
    const candidate = { profileId: p.profileId, averagePct, reachedCount };
    if (
      !best ||
      averagePct > best.averagePct + 1e-12 ||
      (Math.abs(averagePct - best.averagePct) <= 1e-12 && reachedCount > best.reachedCount)
    ) {
      best = candidate;
    }
  }
  return best;
}
