import { describe, expect, it } from "vitest";
import {
  SLOTS,
  isGoalDefined,
  periodLabel,
  planApplyToDepartment,
  planCopyFromPrevious,
  publicationSummary,
  slotCode,
  yearOptions,
} from "@/lib/performance/goals";

describe("spazi", () => {
  it("3 Achievement + 3 Leadership", () => {
    expect(SLOTS.map((s) => s.code)).toEqual(["A1", "A2", "A3", "L1", "L2", "L3"]);
    expect(slotCode("leadership", 2)).toBe("L2");
    expect(periodLabel(2026)).toBe("Performance 2026");
  });

  it("definito se c'è titolo o testo", () => {
    expect(isGoalDefined({ title: " ", objective: "" })).toBe(false);
    expect(isGoalDefined({ title: "Lenti progressive", objective: "" })).toBe(true);
    expect(isGoalDefined({ title: null, objective: "Vendere 50 progressive" })).toBe(true);
    expect(isGoalDefined(undefined)).toBe(false);
  });
});

describe("planCopyFromPrevious", () => {
  it("riempie solo gli spazi vuoti", () => {
    const plan = planCopyFromPrevious(
      [
        { pillar: "achievement", slot: 1, title: "Già scritto", objective: "" },
        { pillar: "achievement", slot: 2, title: "", objective: "  " },
      ],
      [
        { pillar: "achievement", slot: 1, title: "Vecchio A1", objective: "x" },
        { pillar: "achievement", slot: 2, title: " Vecchio A2 ", objective: "y" },
        { pillar: "leadership", slot: 3, title: "Vecchio L3", objective: "" },
        { pillar: "leadership", slot: 1, title: "", objective: "" },
      ],
    );
    expect(plan).toEqual([
      { pillar: "achievement", slot: 2, title: "Vecchio A2", objective: "y" },
      { pillar: "leadership", slot: 3, title: "Vecchio L3", objective: "" },
    ]);
  });

  it("senza periodo precedente non fa nulla", () => {
    expect(planCopyFromPrevious([], [])).toEqual([]);
  });
});

describe("planApplyToDepartment", () => {
  const existing = new Map([
    ["a", { title: "Personalizzato", objective: "" }],
    ["b", { title: "", objective: "" }],
  ]);

  it("non sovrascrive chi ha già l'obiettivo", () => {
    expect(planApplyToDepartment(["a", "b", "c"], existing, false)).toEqual({
      write: ["b", "c"],
      skipped: ["a"],
    });
  });

  it("con sovrascrittura scrive a tutti", () => {
    expect(planApplyToDepartment(["a", "b"], existing, true)).toEqual({
      write: ["a", "b"],
      skipped: [],
    });
  });
});

describe("varie", () => {
  it("riepilogo di pubblicazione", () => {
    expect(
      publicationSummary([
        { title: "A", objective: "", published: true },
        { title: "B", objective: "", published: false },
        { title: "", objective: "", published: false },
      ]),
    ).toEqual({ defined: 2, published: 1, toPublish: 1 });
  });

  it("anni nel selettore", () => {
    expect(yearOptions([2024, 2026], 2026)).toEqual([2027, 2026, 2025, 2024]);
  });
});
