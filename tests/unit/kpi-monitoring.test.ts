import { describe, expect, it } from "vitest";
import {
  averageAchievement,
  bestPerformerAnnouncementTitle,
  missingCompilers,
  performerInputs,
  storeTotalsRows,
  totalsByPerson,
  zoneTable,
} from "@/lib/kpi/monitoring";
import { weekDates } from "@/lib/kpi/sheet";
import { bestPerformer } from "@/lib/targets";

const days = weekDates("2026-10-19");
const kpis = [
  { kpiId: "k-wo", code: "WO", label: "N. WO" },
  { kpiId: "k-ps", code: "PZ_SOLE", label: "Pz sole" },
  { kpiId: "k-meta", code: "META_RB_OO", label: "META RB & OO" },
  { kpiId: "k-nu", code: "NUANCE", label: "NUANCE" },
  { kpiId: "k-erg", code: "ERGO", label: "ERGO" },
  { kpiId: "k-prog", code: "PROG", label: "Progressivi" },
];

describe("storeTotalsRows", () => {
  it("WO e pezzi sole dall'assegnazione, le altre voci dalla somma assegnata", () => {
    const rows = storeTotalsRows({
      kpis,
      totals: { "k-wo": 30, "k-ps": 40, "k-meta": 2, "k-erg": 1 },
      assigned: { "k-wo": 118, "k-meta": 6, "k-nu": 4 },
      store: { vistaWo: 120, solePieces: 220 },
    });
    expect(rows.map((r) => r.code)).toEqual(["WO", "PZ_SOLE", "META_RB_OO", "NUANCE", "ERGO"]);
    expect(rows[0]).toMatchObject({ done: 30, target: 120, targetSource: "negozio" });
    expect(rows[2]).toMatchObject({ done: 2, target: 6, targetSource: "assegnati" });
    expect(rows[4]).toMatchObject({ done: 1, target: null });
  });

  it("card del dipendente: solo le voci principali", () => {
    const rows = storeTotalsRows({ kpis, totals: { "k-erg": 3 }, store: null, headlineOnly: true });
    expect(rows.map((r) => r.code)).toEqual(["WO", "PZ_SOLE", "META_RB_OO", "NUANCE"]);
    expect(rows[0].target).toBeNull();
  });
});

describe("zoneTable (META per persona, Vista / Sole)", () => {
  const table = zoneTable({
    people: [
      { profileId: "v1", name: "Luca", zone: "vista" },
      { profileId: "j1", name: "Francy", zone: "jolly" },
      { profileId: "s1", name: "Giulia", zone: "sole" },
      { profileId: "x", name: "Senza voce", zone: "vista" },
    ],
    kpiId: "k-meta",
    days,
    entries: [
      { profileId: "v1", kpiId: "k-meta", date: days[0], value: 1 },
      { profileId: "v1", kpiId: "k-meta", date: days[2], value: 2 },
      { profileId: "s1", kpiId: "k-meta", date: days[1], value: 1 },
      { profileId: "j1", kpiId: "k-wo", date: days[1], value: 4 },
    ],
    targets: { v1: { "k-meta": 2 }, s1: { "k-meta": 1 } },
    holders: new Set(["v1", "j1", "s1"]),
  });

  it("divide per area con i jolly in Vista e i totali", () => {
    expect(table.groups.map((g) => g.label)).toEqual(["Vista", "Sole"]);
    expect(table.groups[0].rows.map((r) => r.name)).toEqual(["Luca", "Francy"]);
    expect(table.groups[0].rows[0]).toMatchObject({ total: 3, target: 2 });
    expect(table.groups[0].rows[0].values[days[2]]).toBe(2);
    expect(table.groups[0]).toMatchObject({ total: 3, target: 2 });
    expect(table.groups[1]).toMatchObject({ total: 1, target: 1 });
    expect(table).toMatchObject({ total: 4, target: 3 });
  });
});

describe("best performer", () => {
  it("dalle percentuali di raggiungimento della settimana", () => {
    const entries = [
      { profileId: "a", kpiId: "k-wo", date: days[0], value: 10 },
      { profileId: "b", kpiId: "k-wo", date: days[0], value: 6 },
      { profileId: "b", kpiId: "k-meta", date: days[0], value: 2 },
    ];
    const inputs = performerInputs({ a: { "k-wo": 20 }, b: { "k-wo": 10, "k-meta": 1 } }, entries);
    expect(averageAchievement(inputs[0])).toBe(0.5);
    expect(averageAchievement(inputs[1])).toBeCloseTo(1.3);
    expect(bestPerformer(inputs)?.profileId).toBe("b");
    expect(totalsByPerson(entries).b["k-meta"]).toBe(2);
    expect(bestPerformerAnnouncementTitle(43, "Sara P.")).toBe(
      "Best performer della Week 43: Sara P.",
    );
  });
});

describe("missingCompilers", () => {
  it("le persone in turno senza numeri salvati, per giorno", () => {
    const out = missingCompilers({
      dates: ["2026-10-16", "2026-10-17"],
      onShift: [
        { profileId: "a", date: "2026-10-16" },
        { profileId: "a", date: "2026-10-16" }, // turno spezzato
        { profileId: "b", date: "2026-10-16" },
        { profileId: "a", date: "2026-10-17" },
      ],
      filled: [{ profileId: "b", date: "2026-10-16" }],
    });
    expect(out).toEqual([
      { date: "2026-10-16", profileIds: ["a"] },
      { date: "2026-10-17", profileIds: ["a"] },
    ]);
  });
});
