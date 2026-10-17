import { describe, expect, it } from "vitest";
import { createsCycle, describeRule, parseRule } from "@/lib/kpi/rules";
import {
  buildPersonSheet,
  filledDates,
  formatCount,
  isEditableDate,
  parseCount,
  progressRatio,
  remainingText,
  weekDates,
} from "@/lib/kpi/sheet";

const days = weekDates("2026-10-12");
const kpis = [
  { kpiId: "k-wo", code: "WO", label: "N. WO" },
  { kpiId: "k-doppi", code: "DOPPI_VISTA", label: "Doppi vista" },
  { kpiId: "k-meta", code: "META_RB_OO", label: "META RB & OO" },
];

describe("weekDates", () => {
  it("dà i 7 giorni da lunedì a domenica", () => {
    expect(days).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });
});

describe("buildPersonSheet", () => {
  const rows = buildPersonSheet({
    days,
    kpis,
    entries: [
      { kpiId: "k-wo", date: "2026-10-12", value: 3 },
      { kpiId: "k-wo", date: "2026-10-14", value: 2 },
      { kpiId: "k-doppi", date: "2026-10-14", value: 1 },
      { kpiId: "k-meta", date: "2026-10-13", value: 0 },
      { kpiId: "k-wo", date: "2026-10-30", value: 9 }, // fuori settimana: ignorato
    ],
    targets: { "k-wo": 12, "k-doppi": 1 },
    comments: { "k-wo": "Spingi i doppi" },
  });

  it("somma lun→dom e calcola quanto manca", () => {
    expect(rows[0]).toMatchObject({
      label: "N. WO",
      done: 5,
      target: 12,
      remaining: 7,
      reached: false,
      comment: "Spingi i doppi",
    });
    expect(rows[0].values["2026-10-12"]).toBe(3);
    expect(rows[0].values["2026-10-13"]).toBeNull();
    expect(rows[0].ratio).toBeCloseTo(5 / 12);
  });

  it("obiettivo raggiunto a zero", () => {
    expect(rows[1]).toMatchObject({ done: 1, remaining: 0, reached: true, ratio: 1 });
    expect(remainingText(rows[1])).toBe("Obiettivo raggiunto ✓");
  });

  it("senza obiettivo: niente 'quanto manca'", () => {
    expect(rows[2]).toMatchObject({ target: null, remaining: null, reached: false, ratio: 0 });
    expect(rows[2].values["2026-10-13"]).toBe(0);
    expect(remainingText(rows[2])).toBe("—");
  });
});

describe("finestra di modifica", () => {
  it("da 7 giorni fa a oggi, mai il futuro", () => {
    const today = "2026-10-17";
    expect(isEditableDate("2026-10-17", today)).toBe(true);
    expect(isEditableDate("2026-10-10", today)).toBe(true);
    expect(isEditableDate("2026-10-09", today)).toBe(false);
    expect(isEditableDate("2026-10-18", today)).toBe(false);
  });

  it("giornata compilata = almeno un numero, anche 0", () => {
    expect(filledDates([{ date: "2026-10-13" }]).has("2026-10-13")).toBe(true);
    expect(filledDates([]).has("2026-10-13")).toBe(false);
  });
});

describe("parseCount / formatCount", () => {
  it("accetta interi e decimali con la virgola", () => {
    expect(parseCount("3")).toBe(3);
    expect(parseCount(" 2,5 ")).toBe(2.5);
    expect(parseCount("")).toBeNull();
  });
  it("rifiuta negativi e testo", () => {
    expect(parseCount("-1")).toBe("invalid");
    expect(parseCount("tre")).toBe("invalid");
    expect(parseCount("1000000")).toBe("invalid");
  });
  it("formatta all'italiana", () => {
    expect(formatCount(2.5)).toBe("2,5");
    expect(formatCount(null)).toBe("");
  });
  it("barra di avanzamento plafonata", () => {
    expect(progressRatio(20, 10)).toBe(1);
    expect(progressRatio(0, 0)).toBe(1);
    expect(progressRatio(3, null)).toBe(0);
  });
});

describe("regole delle voci", () => {
  it("legge il jsonb e scarta i valori non validi", () => {
    expect(parseRule({ type: "pct_of", kpi: "WO", pct: 0.2 })).toEqual({
      type: "pct_of",
      kpi: "WO",
      pct: 0.2,
    });
    expect(parseRule({ type: "fixed", value: 1 })).toEqual({ type: "fixed", value: 1 });
    expect(parseRule({ type: "boh" })).toBeNull();
    expect(parseRule(null)).toBeNull();
  });

  it("descrive la regola in italiano", () => {
    const label = (c: string) => (c === "WO" ? "N. WO" : c);
    expect(describeRule({ type: "pct_of", kpi: "WO", pct: 0.2 }, label)).toBe("20% di N. WO");
    expect(describeRule({ type: "fixed", value: 3 }, label)).toBe("Fisso 3");
    expect(describeRule({ type: "assignment" }, label)).toBe("Dall'assegnazione");
    expect(describeRule(null, label)).toBe("Manuale");
  });

  it("riconosce i cicli tra percentuali", () => {
    const rules = new Map([
      ["A", { type: "pct_of", kpi: "B", pct: 0.5 } as const],
      ["B", { type: "fixed", value: 1 } as const],
    ]);
    expect(createsCycle("B", { type: "pct_of", kpi: "A", pct: 0.2 }, rules)).toBe(true);
    expect(createsCycle("C", { type: "pct_of", kpi: "A", pct: 0.2 }, rules)).toBe(false);
  });
});
