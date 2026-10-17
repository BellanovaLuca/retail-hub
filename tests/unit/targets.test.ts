import { describe, expect, it } from "vitest";
import {
  assignWeeklyTargets,
  bestPerformer,
  weekProgress,
  type KpiDefinitionRef,
  type StoreWeeklyTargets,
} from "@/lib/targets";

const store: StoreWeeklyTargets = {
  totalHours: 250,
  vistaValueEur: 45_000,
  vistaAvgPrice: 410,
  vistaWo: 120,
  solePieces: 220,
  soleValueEur: 48_500,
  soleAvgPrice: 210,
};

const kpis: KpiDefinitionRef[] = [
  { code: "WO", defaultTargetRule: { type: "assignment" } },
  { code: "DOPPI_VISTA", defaultTargetRule: { type: "pct_of", kpi: "WO", pct: 0.2 } },
  { code: "PZ_SOLE", defaultTargetRule: { type: "assignment" } },
  { code: "DOPPI_SOLE", defaultTargetRule: { type: "pct_of", kpi: "PZ_SOLE", pct: 0.2 } },
  { code: "TRANSITION", defaultTargetRule: { type: "pct_of", kpi: "WO", pct: 0.2 } },
  { code: "PROG", defaultTargetRule: { type: "pct_of", kpi: "WO", pct: 0.1 } },
  { code: "ETE_CONTACT", defaultTargetRule: { type: "fixed", value: 1 } },
  { code: "META_RB_OO", defaultTargetRule: null },
];

const VISTA = ["WO", "DOPPI_VISTA", "PZ_SOLE", "TRANSITION", "PROG", "ETE_CONTACT", "META_RB_OO"];
const SOLE = ["PZ_SOLE", "DOPPI_SOLE", "ETE_CONTACT", "META_RB_OO"];

describe("assignWeeklyTargets", () => {
  const result = assignWeeklyTargets(
    store,
    [
      { profileId: "vista40", zone: "vista", plannedHours: 40, kpiCodes: VISTA },
      { profileId: "sole40", zone: "sole", plannedHours: 40, kpiCodes: SOLE },
      { profileId: "jolly30", zone: "jolly", plannedHours: 30, kpiCodes: VISTA },
      { profileId: "vista4", zone: "vista", plannedHours: 4, kpiCodes: VISTA },
    ],
    kpis,
  );

  it("€/ora vista e sole", () => {
    expect(result.eurPerHourVista).toBe(180);
    expect(result.eurPerHourSole).toBe(194);
  });

  it("persona Vista: valore WO, WO obiettivo e voci in percentuale", () => {
    const p = result.people[0];
    expect(p.valueWo).toBe(7200);
    expect(p.woTarget).toBe(18); // 7200 / 410 = 17,56
    expect(p.valueSole).toBe(0);
    expect(p.targets).toEqual({
      WO: 18,
      DOPPI_VISTA: 4, // 3,6
      PZ_SOLE: 1, // "Pz sole x ADV": fisso 1
      TRANSITION: 4,
      PROG: 2, // 1,8
      ETE_CONTACT: 1,
    });
    expect(p.targets.META_RB_OO).toBeUndefined(); // senza regola: lo scrive l'admin
  });

  it("persona Sole: valore sole e pezzi sole", () => {
    const p = result.people[1];
    expect(p.valueSole).toBe(7760);
    expect(p.soleTarget).toBe(37); // 7760 / 210 = 36,95
    expect(p.woTarget).toBe(0);
    expect(p.targets).toEqual({ PZ_SOLE: 37, DOPPI_SOLE: 7, ETE_CONTACT: 1 });
  });

  it("jolly: calcolo Vista e PZ_SOLE fisso", () => {
    const p = result.people[2];
    expect(p.woTarget).toBe(13); // 5400 / 410 = 13,17
    expect(p.targets.PZ_SOLE).toBe(1);
    expect(p.soleTarget).toBe(0);
  });

  it("percentuali: minimo 1 se la base è > 0", () => {
    const p = result.people[3];
    expect(p.woTarget).toBe(2); // 720 / 410 = 1,76
    expect(p.targets.PROG).toBe(1); // 0,2 → 1
    expect(p.targets.DOPPI_VISTA).toBe(1);
  });

  it("totali assegnati vs obiettivo del negozio", () => {
    expect(result.totals).toMatchObject({
      hoursAssigned: 114,
      hoursTarget: 250,
      woAssigned: 18 + 13 + 2,
      woTarget: 120,
      solePiecesAssigned: 37,
      solePiecesTarget: 220,
    });
    expect(result.totals.byKpi.PZ_SOLE).toBe(37 + 1 + 1 + 1);
    expect(result.totals.byKpi.WO).toBe(33);
  });

  it("ore totali 0 e prezzi medi 0: nessuna divisione per zero", () => {
    const zero = assignWeeklyTargets(
      { ...store, totalHours: 0, vistaAvgPrice: 0 },
      [{ profileId: "x", zone: "vista", plannedHours: 0, kpiCodes: VISTA }],
      kpis,
    );
    expect(zero.eurPerHourVista).toBe(0);
    expect(zero.people[0]).toMatchObject({ valueWo: 0, woTarget: 0 });
    expect(zero.people[0].targets).toMatchObject({ WO: 0, DOPPI_VISTA: 0, PROG: 0 });
    const noPm = assignWeeklyTargets(
      { ...store, soleAvgPrice: 0 },
      [{ profileId: "s", zone: "sole", plannedHours: 40, kpiCodes: SOLE }],
      kpis,
    );
    expect(noPm.people[0].soleTarget).toBe(0);
  });

  it("regole cicliche o voci sconosciute non bloccano il calcolo", () => {
    const r = assignWeeklyTargets(
      store,
      [{ profileId: "x", zone: "vista", plannedHours: 40, kpiCodes: ["A", "B", "IGNOTA"] }],
      [
        { code: "A", defaultTargetRule: { type: "pct_of", kpi: "B", pct: 0.5 } },
        { code: "B", defaultTargetRule: { type: "pct_of", kpi: "A", pct: 0.5 } },
      ],
    );
    expect(r.people[0].targets).toEqual({ A: 0, B: 0 });
  });
});

describe("weekProgress", () => {
  it("a quanto sei / quanto mi manca / obiettivo raggiunto", () => {
    expect(weekProgress([2, 3, 0, 1], 18)).toEqual({ done: 6, remaining: 12, reached: false });
    expect(weekProgress([{ value: 10 }, { value: 9 }], 18)).toEqual({
      done: 19,
      remaining: 0,
      reached: true,
    });
    expect(weekProgress([], 0)).toEqual({ done: 0, remaining: 0, reached: true });
  });
});

describe("bestPerformer", () => {
  it("media delle percentuali senza plafonare", () => {
    const best = bestPerformer([
      {
        profileId: "a",
        items: [
          { target: 10, done: 10 },
          { target: 10, done: 10 },
        ],
      }, // 100%
      {
        profileId: "b",
        items: [
          { target: 10, done: 25 },
          { target: 10, done: 0 },
        ],
      }, // 125%
    ]);
    expect(best).toEqual({ profileId: "b", averagePct: 1.25, reachedCount: 1 });
  });

  it("a parità vince chi ha più voci raggiunte; ignora chi non ha obiettivi", () => {
    const best = bestPerformer([
      { profileId: "nessuno", items: [{ target: 0, done: 5 }] },
      {
        profileId: "a",
        items: [
          { target: 10, done: 20 },
          { target: 10, done: 0 },
        ],
      }, // 100%, 1
      {
        profileId: "b",
        items: [
          { target: 10, done: 10 },
          { target: 10, done: 10 },
        ],
      }, // 100%, 2
    ]);
    expect(best?.profileId).toBe("b");
    expect(bestPerformer([{ profileId: "x", items: [] }])).toBeNull();
    expect(bestPerformer([])).toBeNull();
  });
});

describe("assegnazione con valori scritti a mano", () => {
  const store = {
    totalHours: 100,
    vistaValueEur: 30000,
    vistaAvgPrice: 400,
    vistaWo: 75,
    solePieces: 100,
    soleValueEur: 20000,
    soleAvgPrice: 200,
  };
  const kpis = [
    { code: "WO", defaultTargetRule: { type: "assignment" as const } },
    { code: "DOPPI_VISTA", defaultTargetRule: { type: "pct_of" as const, kpi: "WO", pct: 0.2 } },
    { code: "PROG", defaultTargetRule: { type: "pct_of" as const, kpi: "WO", pct: 0.1 } },
  ];
  const people = [
    {
      profileId: "a",
      zone: "vista" as const,
      plannedHours: 20,
      kpiCodes: ["WO", "DOPPI_VISTA", "PROG"],
    },
  ];

  it('le voci "% di …" seguono il valore corretto a mano della voce base', () => {
    const clean = assignWeeklyTargets(store, people, kpis);
    expect(clean.people[0].targets).toEqual({ WO: 15, DOPPI_VISTA: 3, PROG: 2 });
    const withManual = assignWeeklyTargets(store, people, kpis, { a: { WO: 40 } });
    expect(withManual.people[0].targets).toEqual({ WO: 40, DOPPI_VISTA: 8, PROG: 4 });
  });

  it("una voce derivata corretta a mano vince sulla percentuale", () => {
    const r = assignWeeklyTargets(store, people, kpis, { a: { WO: 40, DOPPI_VISTA: 5 } });
    expect(r.people[0].targets).toEqual({ WO: 40, DOPPI_VISTA: 5, PROG: 4 });
  });
});
