import { describe, expect, it } from "vitest";
import { entriesOutsideSheet, mondayOfDate, weeksOfDates } from "@/app/(app)/obiettivi/entry-rules";

describe("lunedì della settimana (lun → dom)", () => {
  it("lunedì, metà settimana e domenica", () => {
    expect(mondayOfDate("2026-11-23")).toBe("2026-11-23");
    expect(mondayOfDate("2026-11-25")).toBe("2026-11-23");
    expect(mondayOfDate("2026-11-29")).toBe("2026-11-23");
  });
  it("a cavallo d'anno e del cambio dell'ora", () => {
    expect(mondayOfDate("2027-01-01")).toBe("2026-12-28");
    expect(mondayOfDate("2026-03-29")).toBe("2026-03-23");
    expect(mondayOfDate("2026-10-25")).toBe("2026-10-19");
  });
  it("settimane toccate da più date, senza ripetizioni", () => {
    expect(weeksOfDates(["2026-11-30", "2026-11-25", "2026-11-29"])).toEqual([
      "2026-11-23",
      "2026-11-30",
    ]);
  });
});

describe("voci che un dipendente può compilare", () => {
  const allowed = {
    sheetKpiIds: ["wo", "pezzi"],
    targets: [{ kpiId: "meta", weekStart: "2026-11-23" }],
  };

  it("le voci del proprio foglio passano", () => {
    expect(
      entriesOutsideSheet(
        [
          { kpiId: "wo", date: "2026-11-25" },
          { kpiId: "pezzi", date: "2026-11-18" },
        ],
        allowed,
      ),
    ).toEqual([]);
  });

  it("una voce fuori dal foglio passa solo nella settimana in cui ha un obiettivo", () => {
    expect(entriesOutsideSheet([{ kpiId: "meta", date: "2026-11-29" }], allowed)).toEqual([]);
    expect(entriesOutsideSheet([{ kpiId: "meta", date: "2026-11-30" }], allowed)).toEqual([
      { kpiId: "meta", date: "2026-11-30" },
    ]);
  });

  it("una voce di altri (né nel foglio né con obiettivo) viene respinta", () => {
    expect(
      entriesOutsideSheet(
        [
          { kpiId: "wo", date: "2026-11-25" },
          { kpiId: "demo", date: "2026-11-25" },
        ],
        allowed,
      ),
    ).toEqual([{ kpiId: "demo", date: "2026-11-25" }]);
  });

  it("senza foglio né obiettivi non passa nulla", () => {
    expect(
      entriesOutsideSheet([{ kpiId: "wo", date: "2026-11-25" }], { sheetKpiIds: [], targets: [] }),
    ).toHaveLength(1);
  });
});
