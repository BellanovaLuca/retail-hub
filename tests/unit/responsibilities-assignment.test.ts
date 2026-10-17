import { describe, expect, it } from "vitest";
import {
  canToggleCheck,
  cellState,
  dutiesForPerson,
  isoWeekdayOf,
  peopleOnShift,
  resolveDuty,
  shiftDate,
  uncoveredOn,
  type ResponsibilityAssignment,
} from "@/lib/responsibilities/assignment";

// Settimana 12–18 ottobre 2026: il 14 è mercoledì.
const WED = "2026-10-14";
const THU = "2026-10-15";

const annulli: ResponsibilityAssignment = {
  id: "annulli",
  title: "Controllo mail annulli WO e Smartly",
  scheduleDays: [3],
  allStaff: false,
  ownerId: "giulia",
  supportIds: ["paolo", "luca"],
};
const ordini: ResponsibilityAssignment = {
  id: "ordini",
  title: "Ordini da fare",
  scheduleDays: [1, 2, 3, 4, 5, 6, 7],
  allStaff: true,
  ownerId: null,
  supportIds: [],
};

const shifts = (date: string, working: string[], absent: string[] = []) => [
  ...working.map((profile_id) => ({ profile_id, date, is_absence: false })),
  ...absent.map((profile_id) => ({ profile_id, date, is_absence: true })),
];

describe("date", () => {
  it("giorno della settimana ISO", () => {
    expect(isoWeekdayOf("2026-10-12")).toBe(1);
    expect(isoWeekdayOf(WED)).toBe(3);
    expect(isoWeekdayOf("2026-10-18")).toBe(7);
  });

  it("shiftDate attraversa i mesi", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("chi è in turno", () => {
  it("esclude le assenze (riposo, ferie)", () => {
    const set = peopleOnShift(shifts(WED, ["paolo"], ["giulia"]), WED);
    expect(set && [...set]).toEqual(["paolo"]);
  });

  it("null se non c'è alcun turno pubblicato per la data", () => {
    expect(peopleOnShift(shifts(WED, ["paolo"]), THU)).toBeNull();
  });
});

describe("resolveDuty", () => {
  it("il responsabile in turno", () => {
    const on = new Set(["giulia", "paolo"]);
    expect(resolveDuty(annulli, WED, on)).toEqual({ kind: "owner", profileId: "giulia" });
  });

  it("responsabile di riposo il mercoledì: tocca al primo supporto in turno", () => {
    const on = peopleOnShift(shifts(WED, ["luca", "paolo"], ["giulia"]), WED);
    expect(resolveDuty(annulli, WED, on)).toEqual({
      kind: "substitute",
      profileId: "paolo",
      replacingId: "giulia",
    });
  });

  it("salta i supporti non in turno", () => {
    expect(resolveDuty(annulli, WED, new Set(["luca"]))).toEqual({
      kind: "substitute",
      profileId: "luca",
      replacingId: "giulia",
    });
  });

  it("nessuno in turno → scoperta", () => {
    expect(resolveDuty(annulli, WED, new Set(["marta"]))).toEqual({ kind: "uncovered" });
  });

  it("giorno non previsto", () => {
    expect(resolveDuty(annulli, THU, new Set(["giulia"]))).toEqual({ kind: "not_scheduled" });
  });

  it("attività disattivata", () => {
    expect(resolveDuty({ ...annulli, active: false }, WED, null)).toEqual({
      kind: "not_scheduled",
    });
  });

  it("turni non noti: vale il responsabile", () => {
    expect(resolveDuty(annulli, WED, null)).toEqual({ kind: "owner", profileId: "giulia" });
  });

  it("senza responsabile: il primo supporto, senza etichetta di sostituzione", () => {
    const r = { ...annulli, ownerId: null };
    expect(resolveDuty(r, WED, new Set(["luca"]))).toEqual({ kind: "support", profileId: "luca" });
  });

  it("nessun assegnato → scoperta", () => {
    const r = { ...annulli, ownerId: null, supportIds: [] };
    expect(resolveDuty(r, WED, null)).toEqual({ kind: "uncovered" });
  });

  it("attività per tutti", () => {
    expect(resolveDuty(ordini, WED, new Set())).toEqual({ kind: "all_staff" });
  });
});

describe("dutiesForPerson (Oggi tocca a te)", () => {
  const all = [annulli, ordini];

  it("il responsabile in turno vede la sua attività e quelle per tutti", () => {
    const on = new Set(["giulia", "paolo"]);
    expect(
      dutiesForPerson(all, "giulia", WED, on).map((d) => [d.responsibility.id, d.role]),
    ).toEqual([
      ["annulli", "owner"],
      ["ordini", "all_staff"],
    ]);
    expect(dutiesForPerson(all, "paolo", WED, on).map((d) => d.responsibility.id)).toEqual([
      "ordini",
    ]);
  });

  it("il supporto sostituisce il responsabile di riposo", () => {
    const on = new Set(["paolo", "luca"]);
    const duties = dutiesForPerson(all, "paolo", WED, on);
    expect(duties[0]).toMatchObject({ role: "substitute", replacingId: "giulia" });
    expect(dutiesForPerson(all, "luca", WED, on).map((d) => d.responsibility.id)).toEqual([
      "ordini",
    ]);
  });

  it("chi non è in turno non ha nulla", () => {
    expect(dutiesForPerson(all, "giulia", WED, new Set(["paolo"]))).toEqual([]);
  });
});

describe("uncoveredOn", () => {
  it("elenca le attività senza nessuno in turno", () => {
    expect(uncoveredOn([annulli, ordini], WED, new Set(["marta"])).map((r) => r.id)).toEqual([
      "annulli",
    ]);
  });

  it("senza turni pubblicati non segnala nulla", () => {
    expect(uncoveredOn([annulli], WED, null)).toEqual([]);
  });
});

describe("caselle del tabellone", () => {
  const today = WED;
  it("spuntata", () => {
    expect(cellState({ scheduled: true, checked: true, date: "2026-10-13", today })).toBe("done");
  });
  it("prevista e non ancora fatta (oggi e futuro)", () => {
    expect(cellState({ scheduled: true, checked: false, date: today, today })).toBe("pending");
    expect(cellState({ scheduled: true, checked: false, date: THU, today })).toBe("pending");
  });
  it("non svolta a giornata finita", () => {
    expect(cellState({ scheduled: true, checked: false, date: "2026-10-13", today })).toBe(
      "missed",
    );
  });
  it("giorno non previsto", () => {
    expect(cellState({ scheduled: false, checked: false, date: "2026-10-13", today })).toBe("off");
  });
});

describe("chi può spuntare", () => {
  const base = { isAdmin: false, isAssignee: true, allStaff: false, today: WED };
  it("gli assegnati oggi e ieri", () => {
    expect(canToggleCheck({ ...base, date: WED })).toBe(true);
    expect(canToggleCheck({ ...base, date: "2026-10-13" })).toBe(true);
  });
  it("non l'altro ieri né domani", () => {
    expect(canToggleCheck({ ...base, date: "2026-10-12" })).toBe(false);
    expect(canToggleCheck({ ...base, date: THU })).toBe(false);
  });
  it("chi non è assegnato no, salvo attività per tutti", () => {
    expect(canToggleCheck({ ...base, isAssignee: false, date: WED })).toBe(false);
    expect(canToggleCheck({ ...base, isAssignee: false, allStaff: true, date: WED })).toBe(true);
  });
  it("gli admin sempre", () => {
    expect(canToggleCheck({ ...base, isAdmin: true, isAssignee: false, date: "2026-09-01" })).toBe(
      true,
    );
  });
});
