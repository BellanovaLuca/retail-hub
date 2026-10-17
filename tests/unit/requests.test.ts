import { describe, expect, it } from "vitest";
import {
  attachmentError,
  awaitsAdmin,
  formatRange,
  overlaps,
  requestWarnings,
  swapConflicts,
} from "@/lib/requests";

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

describe("avviso sulle assenze già a planning", () => {
  it("segnala le ferie inserite dall'admin, non quelle nate da una richiesta", () => {
    const w = requestWarnings({
      ...base,
      myPlannedLeaves: [
        { date: "2026-11-03", type: "ferie", status: "confirmed", fromRequest: false },
        { date: "2026-11-04", type: "ferie", status: "confirmed", fromRequest: true },
      ],
    });
    expect(w).toEqual(["Nel planning risulti già in ferie il 3 nov."]);
    expect(
      requestWarnings({
        ...base,
        myPlannedLeaves: [
          { date: "2026-11-04", type: "ferie", status: "confirmed", fromRequest: true },
        ],
      }),
    ).toEqual([]);
  });

  it("da confermare e altri tipi", () => {
    const w = requestWarnings({
      ...base,
      myPlannedLeaves: [
        { date: "2026-11-02", type: "permesso", status: "tentative", fromRequest: false },
      ],
    });
    expect(w).toEqual(["Nel planning risulti già in permesso (da confermare) il 2 nov."]);
  });
});

describe("avvisi dello scambio turno", () => {
  const requester = { id: "a", name: "Anna" };
  const target = { id: "b", name: "Bruno" };

  it("nessun avviso se i due giorni sono liberi", () => {
    expect(
      swapConflicts({
        requester,
        target,
        shiftDate: "2026-11-02",
        targetDate: "2026-11-03",
        occupations: [
          { profileId: "a", date: "2026-11-02", kind: "turno", text: "10:00–14:00" },
          { profileId: "b", date: "2026-11-03", kind: "turno", text: "14:00–20:00" },
        ],
      }),
    ).toEqual([]);
  });

  it("il collega ha già un turno o è in ferie il giorno che riceve", () => {
    const occupations = [
      { profileId: "b", date: "2026-11-02", kind: "turno" as const, text: "14:00–20:00" },
      { profileId: "b", date: "2026-11-02", kind: "assenza" as const, text: "in ferie" },
    ];
    expect(
      swapConflicts({ requester, target, shiftDate: "2026-11-02", targetDate: null, occupations }),
    ).toEqual([
      "Attenzione: Bruno ha già un turno il 2 nov (14:00–20:00).",
      "Attenzione: Bruno è in ferie il 2 nov.",
    ]);
  });

  it("stesso giorno: il turno ceduto non è un conflitto, l'assenza sì", () => {
    const occupations = [
      { profileId: "a", date: "2026-11-02", kind: "turno" as const, text: "10:00–14:00" },
      { profileId: "b", date: "2026-11-02", kind: "turno" as const, text: "14:00–20:00" },
      { profileId: "a", date: "2026-11-02", kind: "assenza" as const, text: "in permesso" },
    ];
    expect(
      swapConflicts({
        requester,
        target,
        shiftDate: "2026-11-02",
        targetDate: "2026-11-02",
        occupations,
      }),
    ).toEqual(["Attenzione: Anna è in permesso il 2 nov."]);
  });

  it("chi chiede ha già un turno il giorno del turno del collega", () => {
    expect(
      swapConflicts({
        requester,
        target,
        shiftDate: "2026-11-02",
        targetDate: "2026-11-05",
        occupations: [{ profileId: "a", date: "2026-11-05", kind: "turno", text: "09:00–13:00" }],
        formatDay: (d) => d,
      }),
    ).toEqual(["Attenzione: Anna ha già un turno il 2026-11-05 (09:00–13:00)."]);
  });
});

describe("controllo dell'allegato prima dell'invio", () => {
  it("peso e formato", () => {
    expect(attachmentError({ size: 2 * 1024 * 1024, type: "image/png" })).toBeNull();
    expect(attachmentError({ size: 11 * 1024 * 1024, type: "image/png" })).toBe(
      "L'allegato deve pesare meno di 10 MB.",
    );
    expect(attachmentError({ size: 10, type: "text/plain" })).toMatch(/Formati ammessi/);
    expect(attachmentError({ size: 0, type: "image/png" })).toBe("Scegli un file.");
  });
});
