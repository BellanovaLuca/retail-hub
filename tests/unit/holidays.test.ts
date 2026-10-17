import { describe, expect, it } from "vitest";
import { easter, italianHolidays } from "@/lib/holidays";

describe("festività", () => {
  it.each([
    [2024, [3, 31]],
    [2025, [4, 20]],
    [2026, [4, 5]],
    [2027, [3, 28]],
    [2028, [4, 16]],
  ])("Pasqua %i", (year, expected) => {
    expect(easter(year)).toEqual(expected);
  });

  it("il Lunedì dell'Angelo può cadere nel mese successivo", () => {
    // Pasqua 2029: 1 aprile → Pasquetta 2 aprile; Pasqua 2027: 28 marzo → 29 marzo.
    expect(italianHolidays(2027).find((h) => h.label === "Lunedì dell'Angelo")?.date).toBe(
      "2027-03-29",
    );
    expect(italianHolidays(2029).find((h) => h.label === "Lunedì dell'Angelo")?.date).toBe(
      "2029-04-02",
    );
  });

  it("include Sant'Ambrogio ed è ordinato", () => {
    const list = italianHolidays(2026);
    expect(list).toHaveLength(13);
    expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
    expect(list.some((h) => h.date === "2026-12-07")).toBe(true);
  });
});
