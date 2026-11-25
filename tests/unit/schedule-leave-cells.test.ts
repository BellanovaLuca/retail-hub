import { describe, expect, it } from "vitest";
import {
  leaveCellState,
  leaveKeys,
  leavesInSelection,
  leaveTitle,
  removedLeaveNotices,
  type RemovedLeave,
} from "@/lib/schedule/leave-cells";
import type { LeaveRecord } from "@/lib/schedule/types";

const leave = (patch: Partial<LeaveRecord> = {}): LeaveRecord => ({
  profileId: "anna",
  date: "2026-12-14",
  type: "ferie",
  hours: null,
  status: "confirmed",
  source: "planning",
  ...patch,
});

describe("celle dei giorni di assenza nel foglio turni", () => {
  it("assenza a giornata intera: tratteggio, mai sola lettura", () => {
    const state = leaveCellState(leave({ source: "request" }), false);
    expect(state?.tone).toBe("hatched");
    expect(state?.title).toContain("Ferie · richiesta approvata");
    expect(state?.title).toContain("si può scrivere");
    // Lo stato non porta `readOnly`: la cella si scrive come le altre.
    expect(state).not.toHaveProperty("readOnly");
  });

  it("assenza da confermare: bordo tratteggiato", () => {
    expect(leaveCellState(leave({ status: "tentative" }), false)?.tone).toBe("dashed");
  });

  it("turno scritto sopra l'assenza: in conflitto (rosso), con l'assenza nel titolo", () => {
    const state = leaveCellState(leave({ type: "malattia" }), true);
    expect(state?.tone).toBe("danger");
    expect(state?.title).toContain("Malattia");
    expect(state).not.toHaveProperty("readOnly");
    // Conflitto rimasto segnato senza più assenza: resta rosso, titolo generico.
    expect(leaveCellState(undefined, true)?.tone).toBe("danger");
  });

  it("permesso di poche ore o nessuna assenza: cella normale", () => {
    expect(leaveCellState(leave({ type: "permesso", hours: 2 }), false)).toBeUndefined();
    expect(leaveCellState(undefined, false)).toBeUndefined();
  });

  it("titolo dell'assenza", () => {
    expect(leaveTitle(leave())).toBe("Ferie");
    expect(leaveTitle(leave({ type: "permesso", hours: 2.5, source: "request" }))).toBe(
      "Permesso 2,5h · richiesta approvata",
    );
  });
});

describe("comando rapido «Togli l'assenza»", () => {
  const leaves = [
    leave({ profileId: "bea", date: "2026-12-15" }),
    leave({ profileId: "anna", date: "2026-12-15", type: "permesso", hours: 2 }),
    leave({ profileId: "anna", date: "2026-12-14" }),
    leave({ profileId: "carlo", date: "2026-12-14", fromShift: true }),
  ];

  it("assenze nelle celle selezionate, per giorno e persona", () => {
    const hit = leavesInSelection(leaves, ["anna", "bea"], ["2026-12-14", "2026-12-15"]);
    expect(leaveKeys(hit)).toBe("anna|2026-12-14,anna|2026-12-15,bea|2026-12-15");
    expect(leavesInSelection(leaves, ["anna"], ["2026-12-16"])).toEqual([]);
    expect(leaveKeys([])).toBe("");
  });

  it("un turno rapido di assenza (F scritto nella cella) non è un'assenza da togliere", () => {
    expect(leavesInSelection(leaves, ["carlo"], ["2026-12-14"])).toEqual([]);
  });
});

describe("avvisi dopo aver tolto assenze dal foglio", () => {
  const removed = (patch: Partial<RemovedLeave>): RemovedLeave => ({
    profileId: "anna",
    date: "2026-12-14",
    type: "ferie",
    hours: null,
    status: "confirmed",
    source: "request",
    requestId: "req-1",
    ...patch,
  });

  it("nessun avviso per le assenze inserite a mano dall'admin", () => {
    expect(removedLeaveNotices([removed({ source: "planning", requestId: null })])).toEqual([]);
  });

  it("un avviso per persona e richiesta, con i giorni in ordine", () => {
    const notices = removedLeaveNotices([
      removed({ date: "2026-12-15" }),
      removed({ date: "2026-12-14" }),
      removed({ profileId: "bea", requestId: "req-2", type: "malattia" }),
    ]);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toEqual({
      profileId: "anna",
      body: "Ferie · lun 14 dic, mar 15 dic\nGli altri giorni della richiesta restano approvati.",
      link: "/richieste/req-1",
    });
    expect(notices[1].profileId).toBe("bea");
    expect(notices[1].body).toContain("Malattia · lun 14 dic");
    expect(notices[1].link).toBe("/richieste/req-2");
  });

  it("richiesta rimasta senza giorni: l'avviso dice che ora è rifiutata", () => {
    const [n] = removedLeaveNotices([removed({})], new Set(["req-1"]));
    expect(n.body).toContain("ora risulta rifiutata");
    expect(n.body).not.toContain("restano approvati");
  });

  it("richiesta già eliminata dall'elenco: l'avviso porta al calendario ferie", () => {
    const [n] = removedLeaveNotices([removed({ requestId: null })]);
    expect(n).toEqual({ profileId: "anna", body: "Ferie · lun 14 dic", link: "/ferie" });
  });
});
