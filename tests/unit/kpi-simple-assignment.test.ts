import { describe, expect, it } from "vitest";
import { buildAssignmentPreview, cellKey } from "@/lib/kpi/assignment";
import {
  assignmentKpisFor,
  extraKpisFromSaved,
  isCalculationOn,
  withExtraKpis,
} from "@/lib/kpi/simple-assignment";
import type { StoreWeeklyTargets } from "@/lib/targets";

const kpis = [
  { kpiId: "k-wo", code: "WO", label: "N. WO", defaultTargetRule: { type: "assignment" as const } },
  {
    kpiId: "k-doppi",
    code: "DOPPI_VISTA",
    label: "Doppi vista",
    defaultTargetRule: { type: "pct_of" as const, kpi: "WO", pct: 0.2 },
  },
  { kpiId: "k-demo", code: "DEMO_META", label: "Demo META", defaultTargetRule: null },
];
const empty: StoreWeeklyTargets = {
  totalHours: 40,
  vistaValueEur: 0,
  vistaAvgPrice: 0,
  vistaWo: 0,
  solePieces: 0,
  soleValueEur: 0,
  soleAvgPrice: 0,
};
const anna = {
  profileId: "anna",
  name: "Anna",
  zone: "vista" as const,
  plannedHours: 40,
  kpis: [
    { kpiId: "k-wo", code: "WO", label: "N. WO" },
    { kpiId: "k-doppi", code: "DOPPI_VISTA", label: "Doppi vista" },
  ],
};

describe("assegnazione semplice", () => {
  it("il calcolo è attivo solo con i valori del negozio", () => {
    expect(isCalculationOn(empty)).toBe(false);
    expect(isCalculationOn({ ...empty, vistaValueEur: 1000 })).toBe(true);
    expect(isCalculationOn({ ...empty, soleValueEur: 1 })).toBe(true);
  });

  it("senza calcolo WO resta vuoto e le % seguono il valore scritto a mano", () => {
    const off = assignmentKpisFor(kpis, false);
    expect(off[0].defaultTargetRule).toBeNull();
    expect(off[1].defaultTargetRule).toEqual(kpis[1].defaultTargetRule);
    expect(assignmentKpisFor(kpis, true)).toBe(kpis);

    const blank = buildAssignmentPreview({
      store: empty,
      people: [anna],
      kpis: off,
      overrides: {},
    });
    expect(blank.cells.get(cellKey("anna", "k-wo"))?.value).toBeNull();
    // Senza un valore sui WO anche "Doppi vista" resta vuoto: uno 0 verrebbe salvato come
    // obiettivo e il dipendente vedrebbe "Obiettivo raggiunto ✓".
    expect(blank.cells.get(cellKey("anna", "k-doppi"))).toEqual({
      computed: null,
      value: null,
      overridden: false,
    });
    expect(blank.assignedByKpi).toEqual({});

    const typed = buildAssignmentPreview({
      store: empty,
      people: [anna],
      kpis: off,
      overrides: { [cellKey("anna", "k-wo")]: 10 },
    });
    expect(typed.cells.get(cellKey("anna", "k-wo"))?.value).toBe(10);
    expect(typed.cells.get(cellKey("anna", "k-doppi"))?.value).toBe(2);
  });

  it("le voci fuori dal foglio si aggiungono in fondo", () => {
    const extra = extraKpisFromSaved(
      [anna],
      [
        { profileId: "anna", kpiId: "k-wo" },
        { profileId: "anna", kpiId: "k-demo" },
        { profileId: "bruno", kpiId: "k-demo" },
      ],
    );
    expect(extra).toEqual({ anna: ["k-demo"] });
    const [withDemo] = withExtraKpis([anna], extra, kpis);
    expect(withDemo.kpis.map((k) => k.code)).toEqual(["WO", "DOPPI_VISTA", "DEMO_META"]);
    expect(withExtraKpis([anna], {}, kpis)[0]).toBe(anna);

    const preview = buildAssignmentPreview({
      store: empty,
      people: [withDemo],
      kpis: assignmentKpisFor(kpis, false),
      overrides: { [cellKey("anna", "k-demo")]: 4 },
    });
    expect(preview.cells.get(cellKey("anna", "k-demo"))?.value).toBe(4);
  });
});
