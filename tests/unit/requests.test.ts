import { describe, expect, it } from "vitest";
import { awaitsAdmin, formatRange, overlaps, requestWarnings } from "@/lib/requests";

const base = {
  today: "2026-10-17",
  startDate: "2026-11-02",
  endDate: "2026-11-04",
  noticeDays: 7,
  type: "ferie" as const,
  myOpenRequests: [],
  colleaguesAwayByDate: {},
};

describe("avvisi delle richieste", () => {
  it("nessun avviso quando è tutto in regola", () => {
    expect(requestWarnings(base)).toEqual([]);
  });

  it("preavviso insufficiente, ma non per la malattia", () => {
    const w = requestWarnings({ ...base, startDate: "2026-10-20", endDate: "2026-10-20" });
    expect(w[0]).toMatch(/preavviso minimo è di 7 giorni: questa richiesta ne ha 3/);
    expect(
      requestWarnings({
        ...base,
        type: "malattia",
        startDate: "2026-10-17",
        endDate: "2026-10-17",
      }),
    ).toEqual([]);
  });

  it("sovrapposizione con altre richieste", () => {
    const w = requestWarnings({
      ...base,
      myOpenRequests: [{ type: "permesso", startDate: "2026-11-04", endDate: "2026-11-04" }],
    });
    expect(w).toContain("Si sovrappone a un'altra tua richiesta (permesso).");
  });

  it("colleghi del reparto già in ferie", () => {
    const w = requestWarnings({
      ...base,
      colleaguesAwayByDate: { "2026-11-02": 1, "2026-11-03": 2 },
    });
    expect(w).toContain("In quei giorni sono già in ferie fino a 2 colleghi del tuo reparto.");
  });
});

describe("utilità", () => {
  it("sovrapposizione di intervalli inclusivi", () => {
    expect(
      overlaps(
        { start: "2026-01-01", end: "2026-01-03" },
        { start: "2026-01-03", end: "2026-01-05" },
      ),
    ).toBe(true);
    expect(
      overlaps(
        { start: "2026-01-01", end: "2026-01-02" },
        { start: "2026-01-03", end: "2026-01-05" },
      ),
    ).toBe(false);
  });

  it("chi deve decidere", () => {
    expect(awaitsAdmin({ type: "ferie", status: "pending" })).toBe(true);
    expect(awaitsAdmin({ type: "scambio_turno", status: "pending" })).toBe(false);
    expect(awaitsAdmin({ type: "scambio_turno", status: "peer_accepted" })).toBe(true);
  });

  it("intervalli leggibili", () => {
    expect(formatRange("2026-10-14", "2026-10-14")).toBe("14 ott");
    expect(formatRange("2026-10-14", "2026-10-16")).toBe("14–16 ott");
    expect(formatRange("2026-10-30", "2026-11-02")).toBe("30 ott – 2 nov");
  });
});
