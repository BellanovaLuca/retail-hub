import { describe, expect, it } from "vitest";
import {
  cellsToWrites,
  countOnLeaveByDay,
  dateRange,
  daysOverThreshold,
  exceedsThreshold,
  formatRangeIt,
  groupLeavePeriods,
  leaveRequestHref,
  leaveTotals,
  monthDates,
  parseLeaveThresholds,
  parseYearParam,
  weekdayLetter,
  yearDates,
  type LeaveDay,
} from "@/lib/leaves/plan";

const ferie = (date: string, status: "confirmed" | "tentative" = "confirmed"): LeaveDay => ({
  date,
  type: "ferie",
  status,
  hours: null,
});

describe("giorni dell'anno", () => {
  it("365 o 366 colonne", () => {
    expect(yearDates(2026)).toHaveLength(365);
    expect(yearDates(2028)).toHaveLength(366);
    expect(yearDates(2026)[0]).toBe("2026-01-01");
    expect(yearDates(2026).at(-1)).toBe("2026-12-31");
  });

  it("mesi e febbraio bisestile", () => {
    expect(monthDates(2026, 2)).toHaveLength(28);
    expect(monthDates(2028, 2)).toHaveLength(29);
    expect(monthDates(2026, 8).at(-1)).toBe("2026-08-31");
  });

  it("lettera del giorno L M M G V S D", () => {
    expect(weekdayLetter("2026-10-12")).toBe("L"); // lunedì
    expect(weekdayLetter("2026-10-14")).toBe("M"); // mercoledì
    expect(weekdayLetter("2026-10-17")).toBe("S");
    expect(weekdayLetter("2026-10-18")).toBe("D");
  });

  it("intervallo di date in qualsiasi ordine, attraverso il cambio dell'ora", () => {
    expect(dateRange("2026-10-24", "2026-10-26")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
    expect(dateRange("2026-03-02", "2026-02-27")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });
});

describe("groupLeavePeriods", () => {
  it("unisce i giorni consecutivi con lo stesso tipo e stato", () => {
    const periods = groupLeavePeriods([
      ferie("2026-08-12"),
      ferie("2026-08-10"),
      ferie("2026-08-11"),
      ferie("2026-08-14"),
    ]);
    expect(periods).toEqual([
      {
        from: "2026-08-10",
        to: "2026-08-12",
        days: 3,
        type: "ferie",
        status: "confirmed",
        hours: null,
      },
      {
        from: "2026-08-14",
        to: "2026-08-14",
        days: 1,
        type: "ferie",
        status: "confirmed",
        hours: null,
      },
    ]);
  });

  it("uno stato o un tipo diverso spezza il periodo; i permessi orari restano singoli", () => {
    const periods = groupLeavePeriods([
      ferie("2026-08-10"),
      ferie("2026-08-11", "tentative"),
      ferie("2026-08-12", "tentative"),
      { date: "2026-08-13", type: "permesso", status: "confirmed", hours: 4 },
      { date: "2026-08-14", type: "permesso", status: "confirmed", hours: 4 },
      { date: "2026-08-15", type: "malattia", status: "confirmed", hours: null },
    ]);
    expect(periods.map((p) => [p.from, p.to, p.type, p.status])).toEqual([
      ["2026-08-10", "2026-08-10", "ferie", "confirmed"],
      ["2026-08-11", "2026-08-12", "ferie", "tentative"],
      ["2026-08-13", "2026-08-13", "permesso", "confirmed"],
      ["2026-08-14", "2026-08-14", "permesso", "confirmed"],
      ["2026-08-15", "2026-08-15", "malattia", "confirmed"],
    ]);
  });

  it("attraversa la fine del mese", () => {
    const periods = groupLeavePeriods([ferie("2026-07-31"), ferie("2026-08-01")]);
    expect(periods).toHaveLength(1);
    expect(periods[0].days).toBe(2);
  });
});

describe("leaveTotals", () => {
  it("conta solo le ferie dell'anno, separando quelle da confermare", () => {
    expect(
      leaveTotals(
        [
          ferie("2026-08-10"),
          ferie("2026-08-11"),
          ferie("2026-12-30", "tentative"),
          ferie("2027-01-02"),
          { date: "2026-05-04", type: "permesso", status: "confirmed", hours: 4 },
        ],
        2026,
      ),
    ).toEqual({ confirmed: 2, tentative: 1, total: 3 });
  });
});

describe("conteggi e soglie", () => {
  const dept: Record<string, string> = { a: "ott", b: "ott", c: "add", d: "add" };
  const counts = countOnLeaveByDay(
    [
      { profileId: "a", date: "2026-08-10", type: "ferie" },
      { profileId: "b", date: "2026-08-10", type: "ferie" },
      { profileId: "c", date: "2026-08-10", type: "ferie" },
      { profileId: "d", date: "2026-08-10", type: "assente" },
      { profileId: "a", date: "2026-08-11", type: "permesso", hours: 4 },
      { profileId: "c", date: "2026-08-11", type: "ferie", hours: null },
    ],
    (id) => dept[id],
  );

  it("conta per giorno e per reparto, solo le ferie", () => {
    expect(counts.get("2026-08-10")).toEqual({ total: 3, byDepartment: { ott: 2, add: 1 } });
    expect(counts.get("2026-08-11")).toEqual({ total: 1, byDepartment: { add: 1 } });
    expect(counts.get("2026-08-12")).toBeUndefined();
  });

  it("la soglia è il massimo ammesso", () => {
    expect(exceedsThreshold(2, 2)).toBe(false);
    expect(exceedsThreshold(3, 2)).toBe(true);
    expect(exceedsThreshold(5, undefined)).toBe(false);
    expect(exceedsThreshold(1, 0)).toBe(true);
  });

  it("giorni oltre soglia per reparto", () => {
    expect(daysOverThreshold(counts, { ott: 1, add: 1 })).toEqual([
      { date: "2026-08-10", departmentId: "ott", count: 2, threshold: 1 },
    ]);
  });

  it("legge le soglie salvate ignorando i valori non validi", () => {
    expect(parseLeaveThresholds({ ott: 2, add: "1", x: -1, y: 1.5, z: "abc" })).toEqual({
      ott: 2,
      add: 1,
    });
    expect(parseLeaveThresholds(null)).toEqual({});
    expect(parseLeaveThresholds([1, 2])).toEqual({});
  });
});

describe("cellsToWrites", () => {
  it("converte i codici in scritture e svuota con il valore vuoto", () => {
    const { writes, errors } = cellsToWrites([
      { profileId: "a", date: "2026-08-10", value: "F" },
      { profileId: "a", date: "2026-08-11", value: "f?" },
      { profileId: "a", date: "2026-08-12", value: "PE4" },
      { profileId: "a", date: "2026-08-13", value: "" },
      { profileId: "a", date: "2026-08-14", value: "XYZ" },
    ]);
    expect(errors).toHaveLength(1);
    expect(writes).toEqual([
      {
        kind: "upsert",
        profileId: "a",
        date: "2026-08-10",
        type: "ferie",
        status: "confirmed",
        hours: null,
      },
      {
        kind: "upsert",
        profileId: "a",
        date: "2026-08-11",
        type: "ferie",
        status: "tentative",
        hours: null,
      },
      {
        kind: "upsert",
        profileId: "a",
        date: "2026-08-12",
        type: "permesso",
        status: "confirmed",
        hours: 4,
      },
      { kind: "delete", profileId: "a", date: "2026-08-13" },
    ]);
  });

  it("a parità di cella vale l'ultima modifica", () => {
    const { writes } = cellsToWrites([
      { profileId: "a", date: "2026-08-10", value: "F" },
      { profileId: "a", date: "2026-08-10", value: "MA" },
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: "upsert", type: "malattia" });
  });
});

describe("varie", () => {
  it("link alla richiesta di ferie con le date in ordine", () => {
    expect(leaveRequestHref("2026-08-14", "2026-08-10")).toBe(
      "/richieste/nuova?tipo=ferie&dal=2026-08-10&al=2026-08-14",
    );
  });

  it("anno dal parametro di URL", () => {
    expect(parseYearParam("2027", 2026)).toBe(2027);
    expect(parseYearParam("27", 2026)).toBe(2026);
    expect(parseYearParam("1999", 2026)).toBe(2026);
    expect(parseYearParam(undefined, 2026)).toBe(2026);
  });

  it("date brevi in italiano", () => {
    expect(formatRangeIt("2026-08-10", "2026-08-14")).toBe("10 ago – 14 ago");
    expect(formatRangeIt("2026-12-08", "2026-12-08")).toBe("8 dic");
  });
});
