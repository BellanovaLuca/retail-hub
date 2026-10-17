import { describe, expect, it } from "vitest";
import {
  buildAssignmentPreview,
  cellKey,
  countedHoursByPerson,
  formatAmount,
  formatEurPerHour,
  overridesFromSaved,
  parseAmount,
  type AssignmentPerson,
} from "@/lib/kpi/assignment";
import type { SchedulePerson } from "@/lib/schedule/types";
import type { StoreWeeklyTargets } from "@/lib/targets";

const person = (id: string, over: Partial<SchedulePerson> = {}): SchedulePerson => ({
  id,
  displayName: id,
  shortLabel: id,
  color: null,
  homeZone: "vista",
  weeklyHours: 40,
  countsForCoverage: true,
  primaryDepartmentId: null,
  departmentIds: [],
  ...over,
});

const shift = (profileId: string, start: string | null, end: string | null, extra = {}) => ({
  profileId,
  start,
  end,
  breakMinutes: 0,
  isBackOffice: null as boolean | null,
  ...extra,
});

describe("countedHoursByPerson", () => {
  it("somma le ore nette ed esclude back office e assenze", () => {
    const people = [person("a"), person("bo", { countsForCoverage: false })];
    const hours = countedHoursByPerson(
      [
        shift("a", "10:00", "20:00", { breakMinutes: 60 }),
        shift("a", "10:00", "14:00", { isBackOffice: true }),
        shift("a", null, null),
        shift("bo", "10:00", "14:00"),
        shift("bo", "16:00", "20:00", { isBackOffice: false }),
      ],
      people,
    );
    expect(hours.get("a")).toBe(9);
    expect(hours.get("bo")).toBe(4);
  });
});

const store: StoreWeeklyTargets = {
  totalHours: 250,
  vistaValueEur: 45_000,
  vistaAvgPrice: 410,
  vistaWo: 120,
  solePieces: 220,
  soleValueEur: 48_500,
  soleAvgPrice: 210,
};

const kpis = [
  { kpiId: "k-wo", code: "WO", defaultTargetRule: { type: "assignment" } as const },
  {
    kpiId: "k-dv",
    code: "DOPPI_VISTA",
    defaultTargetRule: { type: "pct_of", kpi: "WO", pct: 0.2 } as const,
  },
  { kpiId: "k-ps", code: "PZ_SOLE", defaultTargetRule: { type: "assignment" } as const },
  { kpiId: "k-meta", code: "META_RB_OO", defaultTargetRule: null },
];

const people: AssignmentPerson[] = [
  {
    profileId: "v",
    name: "Vista",
    zone: "vista",
    plannedHours: 40,
    kpis: [
      { kpiId: "k-wo", code: "WO", label: "N. WO" },
      { kpiId: "k-dv", code: "DOPPI_VISTA", label: "Doppi vista" },
      { kpiId: "k-ps", code: "PZ_SOLE", label: "Pz sole x ADV" },
      { kpiId: "k-meta", code: "META_RB_OO", label: "META" },
    ],
  },
  {
    profileId: "s",
    name: "Sole",
    zone: "sole",
    plannedHours: 40,
    kpis: [{ kpiId: "k-ps", code: "PZ_SOLE", label: "Pz sole" }],
  },
];

describe("buildAssignmentPreview", () => {
  it("propone gli obiettivi in proporzione alle ore (esempio della spec)", () => {
    const p = buildAssignmentPreview({ store, people, kpis, overrides: {} });
    // 45.000 / 250 = 180 €/h; × 40 h = 7.200 €; / 410 = 17,56 → 18 WO.
    expect(p.assignment.eurPerHourVista).toBe(180);
    expect(p.cells.get(cellKey("v", "k-wo"))).toEqual({
      computed: 18,
      value: 18,
      overridden: false,
    });
    expect(p.cells.get(cellKey("v", "k-dv"))?.value).toBe(4);
    expect(p.cells.get(cellKey("v", "k-ps"))?.value).toBe(1); // Pz sole x ADV
    expect(p.cells.get(cellKey("v", "k-meta"))?.value).toBeNull();
    // 48.500 / 250 = 194 €/h; × 40 = 7.760 €; / 210 = 36,95 → 37 pezzi.
    expect(p.cells.get(cellKey("s", "k-ps"))?.value).toBe(37);
    expect(p.woAssigned).toBe(18);
    expect(p.solePiecesAssigned).toBe(37);
    expect(p.assignedByKpi["k-ps"]).toBe(38);
  });

  it("le sovrascritture cambiano i totali e restano evidenziate", () => {
    const p = buildAssignmentPreview({
      store,
      people,
      kpis,
      overrides: {
        [cellKey("v", "k-wo")]: 20,
        [cellKey("v", "k-meta")]: 2,
        [cellKey("s", "k-ps")]: 37, // uguale al calcolo: non conta come sovrascritta
      },
    });
    expect(p.cells.get(cellKey("v", "k-wo"))).toEqual({
      computed: 18,
      value: 20,
      overridden: true,
    });
    expect(p.cells.get(cellKey("v", "k-meta"))?.overridden).toBe(true);
    expect(p.cells.get(cellKey("s", "k-ps"))?.overridden).toBe(false);
    expect(p.woAssigned).toBe(20);
    // Il doppio vista segue la regola sul WO calcolato, non sulla sovrascrittura.
    expect(p.cells.get(cellKey("v", "k-dv"))?.value).toBe(4);
  });

  it("ripristina dalle righe salvate solo sovrascritture e voci manuali", () => {
    const base = buildAssignmentPreview({ store, people, kpis, overrides: {} });
    const out = overridesFromSaved(
      [
        { profileId: "v", kpiId: "k-wo", target: 15, overridden: false },
        { profileId: "v", kpiId: "k-dv", target: 9, overridden: true },
        { profileId: "v", kpiId: "k-meta", target: 2, overridden: false },
        { profileId: "x", kpiId: "k-wo", target: 3, overridden: true },
      ],
      base.cells,
    );
    expect(out).toEqual({ [cellKey("v", "k-dv")]: 9, [cellKey("v", "k-meta")]: 2 });
  });

  it("formatta €/ora", () => {
    expect(formatEurPerHour(180)).toBe("180,00 €/h");
  });
});

describe("parseAmount / formatAmount", () => {
  it("legge gli importi all'italiana", () => {
    expect(parseAmount("45.000")).toBe(45000);
    expect(parseAmount("45000 €")).toBe(45000);
    expect(parseAmount("1.234.567,5")).toBe(1234567.5);
    expect(parseAmount("410,50")).toBe(410.5);
    expect(parseAmount("2.5")).toBe(2.5);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("-3")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
  it("formatta con i separatori", () => {
    expect(formatAmount(48500)).toBe("48.500");
  });
});
