import { describe, expect, it } from "vitest";
import { areaColumns, areaOf, areaSheet, fillProposals } from "@/lib/kpi/area-tables";
import { cellKey } from "@/lib/kpi/assignment";
import {
  productivityLevel,
  totalProductivity,
  totalRevenue,
  type StoreWeeklyTargets,
} from "@/lib/targets";

const kpis = [
  { kpiId: "wo", code: "WO", label: "N. WO", defaultTargetRule: { type: "assignment" as const } },
  {
    kpiId: "doppi",
    code: "DOPPI_VISTA",
    label: "Doppi vista",
    defaultTargetRule: { type: "pct_of" as const, kpi: "WO", pct: 0.2 },
  },
  {
    kpiId: "pz",
    code: "PZ_SOLE",
    label: "Pz sole",
    defaultTargetRule: { type: "assignment" as const },
  },
  {
    kpiId: "ergo",
    code: "ERGO",
    label: "ERGO",
    defaultTargetRule: { type: "fixed" as const, value: 1 },
  },
  { kpiId: "lac", code: "LAC", label: "Lenti a contatto", defaultTargetRule: null },
];
const sets = [
  {
    id: "s-vista",
    name: "Vista",
    items: [
      { kpiId: "doppi", labelOverride: null, sortOrder: 2 },
      { kpiId: "wo", labelOverride: null, sortOrder: 1 },
      { kpiId: "pz", labelOverride: "Pz sole x ADV", sortOrder: 3 },
    ],
  },
  {
    id: "s-sole",
    name: "Sole",
    items: [
      { kpiId: "pz", labelOverride: null, sortOrder: 1 },
      { kpiId: "ergo", labelOverride: null, sortOrder: 2 },
    ],
  },
];
const empty: StoreWeeklyTargets = {
  totalHours: 0,
  vistaValueEur: 0,
  vistaAvgPrice: 0,
  vistaWo: 0,
  solePieces: 0,
  soleValueEur: 0,
  soleAvgPrice: 0,
};
const people = [
  { profileId: "anna", name: "Anna", zone: "vista" as const, plannedHours: 40 },
  { profileId: "jo", name: "Jo", zone: "jolly" as const, plannedHours: 20 },
  { profileId: "sara", name: "Sara", zone: "sole" as const, plannedHours: 40 },
];

describe("tabelle Vista e Sole", () => {
  it("i jolly stanno con il Vista", () => {
    expect(areaOf("vista")).toBe("vista");
    expect(areaOf("jolly")).toBe("vista");
    expect(areaOf("sole")).toBe("sole");
  });

  it("ogni tabella ha le voci del suo gruppo, nell'ordine e con l'etichetta del gruppo", () => {
    expect(areaSheet(sets, kpis, "vista").map((k) => k.label)).toEqual([
      "N. WO",
      "Doppi vista",
      "Pz sole x ADV",
    ]);
    expect(areaSheet(sets, kpis, "sole").map((k) => k.label)).toEqual(["Pz sole", "ERGO"]);
  });

  it("le voci dell'altra area compaiono solo se richieste o già usate (obiettivi misti)", () => {
    const base = { area: "sole" as const, sets, kpis };
    expect(
      areaColumns({ ...base, showMixed: false, usedKpiIds: new Set() }).map((c) => c.kpiId),
    ).toEqual(["pz", "ergo"]);
    const used = areaColumns({ ...base, showMixed: false, usedKpiIds: new Set(["wo"]) });
    expect(used.map((c) => [c.kpiId, c.mixed])).toEqual([
      ["pz", false],
      ["ergo", false],
      ["wo", true],
    ]);
    const all = areaColumns({ ...base, showMixed: true, usedKpiIds: new Set() });
    expect(all.filter((c) => c.mixed).map((c) => c.kpiId)).toEqual(["wo", "doppi", "lac"]);
  });

  it("«Proponi» riempie solo le celle vuote delle voci dell'area, senza toccare quelle scritte", () => {
    const values = { [cellKey("anna", "wo")]: 10, [cellKey("sara", "ergo")]: 5 };
    const out = fillProposals({ store: empty, people, kpis, sets, values });
    // Anna: doppi = 20% dei 10 WO scritti; il suo WO resta 10.
    expect(out.values[cellKey("anna", "wo")]).toBe(10);
    expect(out.values[cellKey("anna", "doppi")]).toBe(2);
    // Sara (Sole): ERGO scritto a mano resta 5; nessuna voce del Vista.
    expect(out.values[cellKey("sara", "ergo")]).toBe(5);
    expect(cellKey("sara", "wo") in out.values).toBe(false);
    expect(cellKey("sara", "doppi") in out.values).toBe(false);
    // Jo senza WO scritto: niente doppi inventati.
    expect(cellKey("jo", "doppi") in out.values).toBe(false);
    expect(out.filled).toBe(1);
    // Non modifica l'oggetto di partenza.
    expect(Object.keys(values)).toHaveLength(2);
  });

  it("con i numeri del negozio propone WO e pezzi sole dalle ore", () => {
    const store = {
      ...empty,
      totalHours: 100,
      vistaValueEur: 10000,
      vistaAvgPrice: 400,
      soleValueEur: 2000,
      soleAvgPrice: 100,
    };
    const out = fillProposals({ store, people, kpis, sets, values: {} });
    expect(out.values[cellKey("anna", "wo")]).toBe(10); // 100 €/h × 40 h ÷ 400
    expect(out.values[cellKey("sara", "pz")]).toBe(8); // 20 €/h × 40 h ÷ 100
  });
});

describe("produttività oraria", () => {
  it("fatturato totale (vista + sole + lenti a contatto + altro) diviso le ore lavorate", () => {
    const store: StoreWeeklyTargets = {
      ...empty,
      totalHours: 300,
      vistaValueEur: 30000,
      soleValueEur: 6000,
      lacValueEur: 3000,
      otherValueEur: 1500,
    };
    expect(totalRevenue(store)).toBe(40500);
    expect(totalProductivity(store)).toBe(135);
    expect(totalProductivity({ ...store, totalHours: 0 })).toBe(0);
    // Senza i campi nuovi (settimane vecchie) contano vista e sole.
    expect(totalRevenue({ ...empty, vistaValueEur: 100, soleValueEur: 50 })).toBe(150);
  });

  it("il riferimento è 130–140 €/ora", () => {
    expect(productivityLevel(0)).toBe("none");
    expect(productivityLevel(129.9)).toBe("below");
    expect(productivityLevel(130)).toBe("ok");
    expect(productivityLevel(140)).toBe("ok");
    expect(productivityLevel(151)).toBe("above");
  });
});
