import { describe, expect, it } from "vitest";
import { buildTargetsExportModel } from "@/lib/export/targets-model";
import { findKpiByName } from "@/lib/kpi/area-tables";
import { storeTotalsRows } from "@/lib/kpi/monitoring";
import { buildPersonSheet, withExtraSheetKpis } from "@/lib/kpi/sheet";
import {
  daysOfPerson,
  gridState,
  hasAnyAssignee,
  hasAssignees,
  uncheckedOn,
  uncoveredByReason,
  withWeekTeam,
  type ResponsibilityAssignment,
} from "@/lib/responsibilities/assignment";

// Casi riprodotti nell'audit del 29/11/2026 su obiettivi e responsabilità.

describe("obiettivi misti: voci fuori dal foglio con obiettivo o numeri in settimana", () => {
  const available = [
    { kpiId: "pz", code: "PZ_SOLE", label: "Pz sole" },
    { kpiId: "wo", code: "WO", label: "N. WO" },
    { kpiId: "meta", code: "META_RB_OO", label: "META RB & OO" },
  ];
  const soleSheet = [{ kpiId: "pz", code: "PZ_SOLE", label: "Pz sole" }];

  it("aggiunge in fondo le voci extra, una volta sola, senza toccare quelle del foglio", () => {
    expect(
      withExtraSheetKpis(soleSheet, ["wo", "pz", "wo"], available).map((k) => k.kpiId),
    ).toEqual(["pz", "wo"]);
    // Il foglio resta com'è (stesse voci, stessa etichetta del gruppo).
    expect(withExtraSheetKpis(soleSheet, [], available)).toEqual(soleSheet);
  });

  it("ignora le voci non attive o sconosciute", () => {
    expect(withExtraSheetKpis(soleSheet, ["spenta"], available).map((k) => k.kpiId)).toEqual([
      "pz",
    ]);
  });

  it("l'export contiene anche l'obiettivo misto e i suoi numeri (prima mancavano)", () => {
    const targets = { giulia: { pz: 10, wo: 5 } };
    const entries = [{ profileId: "giulia", kpiId: "wo", date: "2026-11-23", value: 3 }];
    const model = buildTargetsExportModel({
      weekStart: "2026-11-23",
      people: [
        {
          profileId: "giulia",
          name: "Giulia",
          zone: "sole",
          kpis: withExtraSheetKpis(
            soleSheet,
            [...Object.keys(targets.giulia), ...entries.map((e) => e.kpiId)],
            available,
          ),
        },
      ],
      entries,
      targets,
      comments: {},
      notes: {},
    });
    const rows = model.sheets.find((s) => s.zone === "sole")!.blocks[0].rows;
    expect(rows.map((r) => r.label)).toEqual(["Pz sole", "N. WO"]);
    expect(rows[1]).toMatchObject({ target: 5, done: 3, remaining: 2 });
  });

  it("la card della Home vede l'obiettivo misto anche se è l'unico", () => {
    const rows = buildPersonSheet({
      days: ["2026-11-23"],
      kpis: withExtraSheetKpis(soleSheet, ["wo"], available),
      entries: [],
      targets: { wo: 5 },
    });
    expect(rows.filter((r) => r.target !== null && r.target > 0).map((r) => r.code)).toEqual([
      "WO",
    ]);
  });
});

describe("«Aggiungi colonna»: riconosce la voce anche dal nome che ha nell'altra tabella", () => {
  const kpis = [
    { id: "k-meta", label: "META RB & OO" },
    { id: "k-pz", label: "Pz sole" },
  ];
  const items = [
    { set_id: "sole", kpi_id: "k-meta", label_override: "META" },
    { set_id: "vista", kpi_id: "k-meta", label_override: null },
    { set_id: "vista", kpi_id: "k-pz", label_override: "Pz sole x ADV" },
    { set_id: "sole", kpi_id: "k-pz", label_override: null },
  ];

  it("«META» scritto nella tabella Vista è la voce META RB & OO, non un doppione", () => {
    expect(findKpiByName(" meta ", kpis, items, "vista")?.id).toBe("k-meta");
  });

  it("«Pz sole x ADV» scritto nella tabella Sole è la voce Pz sole", () => {
    expect(findKpiByName("Pz sole x ADV", kpis, items, "sole")?.id).toBe("k-pz");
  });

  it("l'etichetta propria e quella del gruppo di destinazione continuano a valere", () => {
    expect(findKpiByName("pz sole", kpis, items, "vista")?.id).toBe("k-pz");
    expect(findKpiByName("META", kpis, items, "sole")?.id).toBe("k-meta");
  });

  it("un nome nuovo non corrisponde a nessuna voce", () => {
    expect(findKpiByName("Lenti a contatto", kpis, items, "vista")).toBeUndefined();
  });
});

describe("card «Negozio» dei dipendenti: obiettivo di META e NUANCE dalla somma assegnata", () => {
  const kpis = [
    { kpiId: "m", code: "META_RB_OO", label: "META" },
    { kpiId: "wo", code: "WO", label: "WO" },
  ];

  it("senza la somma degli assegnati META resta senza obiettivo", () => {
    const rows = storeTotalsRows({
      kpis,
      totals: { m: 4 },
      store: { vistaWo: 100, solePieces: 0 },
      headlineOnly: true,
    });
    expect(rows.find((r) => r.code === "META_RB_OO")?.target).toBeNull();
  });

  it("con la somma degli assegnati (store_weekly_assigned) META ha il suo obiettivo", () => {
    const rows = storeTotalsRows({
      kpis,
      totals: { m: 4 },
      assigned: { m: 9, wo: 80 },
      store: { vistaWo: 100, solePieces: 0 },
      headlineOnly: true,
    });
    expect(rows.find((r) => r.code === "META_RB_OO")).toMatchObject({
      done: 4,
      target: 9,
      targetSource: "assegnati",
    });
    // Per i WO vale sempre l'obiettivo del negozio.
    expect(rows.find((r) => r.code === "WO")).toMatchObject({
      target: 100,
      targetSource: "negozio",
    });
  });
});

// Settimana 23–29 novembre 2026: il 23 è lunedì.
const MON = "2026-11-23";
const TUE = "2026-11-24";
const THU = "2026-11-26";

const base: ResponsibilityAssignment = {
  id: "r",
  title: "Montaggi",
  scheduleDays: [1, 2, 3, 4, 5, 6, 7],
  allStaff: false,
  ownerId: null,
  supportIds: [],
};

describe("responsabilità: una sola regola per «mancanti» e «senza nessuno»", () => {
  const assigned = withWeekTeam({ ...base, id: "a", title: "WhatsApp" }, ["mario", "luigi"], {
    mario: [1, 2, 3],
    luigi: [4],
  });
  const emptyWeek = withWeekTeam({ ...base, id: "e", title: "Vuota" }, [], {});
  const neverAssigned = { ...base, id: "n", title: "Mai assegnata" };
  const standing = { ...base, id: "s", title: "Scheda", ownerId: "anna" };
  const everyone = { ...base, id: "t", title: "Ordini", allStaff: true };
  const all = [assigned, emptyWeek, neverAssigned, standing, everyone];

  it("hasAssignees: per tutti, scheda e gruppo della settimana sì; senza nessuno no", () => {
    expect(all.filter(hasAssignees).map((r) => r.id)).toEqual(["a", "s", "t"]);
    expect(hasAnyAssignee({ allStaff: false, personDays: { mario: [] } })).toBe(false);
    expect(hasAnyAssignee({ allStaff: false, personDays: { mario: [2] } })).toBe(true);
    expect(hasAnyAssignee({ allStaff: true, personDays: {} })).toBe(true);
  });

  it("uncheckedOn: non conta le attività senza nessuno assegnato né i giorni non previsti", () => {
    // Lunedì: WhatsApp (Mario), Scheda (Anna), Ordini (tutti). Le due senza assegnati no.
    expect(uncheckedOn(all, MON, () => false).map((r) => r.id)).toEqual(["a", "s", "t"]);
    // Venerdì nessuno ha WhatsApp: non è prevista.
    expect(uncheckedOn(all, "2026-11-27", () => false).map((r) => r.id)).toEqual(["s", "t"]);
    // Le spuntate escono.
    expect(uncheckedOn(all, MON, (r) => r.id === "a").map((r) => r.id)).toEqual(["s", "t"]);
    // Un'attività tolta dal tabellone non è mai «mancante».
    expect(uncheckedOn([{ ...standing, active: false }], MON, () => false)).toEqual([]);
  });

  it("uncoveredByReason: distingue «assegnato non in turno» da «nessuno assegnato»", () => {
    // Giovedì tocca a Luigi, che non è in turno; Anna (scheda) sì.
    const out = uncoveredByReason(all, THU, new Set(["mario", "anna"]));
    expect(out.away.map((r) => r.id)).toEqual(["a"]);
    expect(out.unassigned.map((r) => r.id)).toEqual(["e", "n"]);
  });

  it("uncoveredByReason: senza turni pubblicati non segnala nulla", () => {
    expect(uncoveredByReason(all, THU, null)).toEqual({ unassigned: [], away: [] });
  });

  it("i giorni di una persona sono i suoi, non quelli di tutto il gruppo", () => {
    // È ciò che mostra «Le mie responsabilità»: Luigi solo giovedì, anche se l'attività è
    // prevista da lunedì a giovedì.
    expect(assigned.scheduleDays).toEqual([1, 2, 3, 4]);
    expect(daysOfPerson(assigned, "luigi")).toEqual([4]);
    expect(daysOfPerson(assigned, "mario")).toEqual([1, 2, 3]);
  });
});

describe("gridState: l'attività è assegnata dalla griglia «Chi fa cosa»?", () => {
  it("mai assegnata con la griglia", () => {
    expect(gridState([], MON)).toEqual({
      any: false,
      inForce: false,
      hasPast: false,
      pastTeam: false,
    });
  });

  it("riga della settimana corrente: in vigore, niente da chiudere", () => {
    expect(gridState([{ week_start: MON, profile_ids: ["mario"] }], MON)).toMatchObject({
      any: true,
      inForce: true,
      hasPast: false,
      pastTeam: false,
    });
  });

  it("gruppo ripreso da una settimana passata: in vigore e da chiudere con una riga vuota", () => {
    expect(
      gridState(
        [
          { week_start: "2026-11-02", profile_ids: [] },
          { week_start: "2026-11-09", profile_ids: ["mario"] },
        ],
        MON,
      ),
    ).toMatchObject({ inForce: true, hasPast: true, pastTeam: true });
  });

  it("l'ultima riga passata è vuota: nessun gruppo tornerebbe in vigore", () => {
    expect(
      gridState(
        [
          { week_start: "2026-11-09", profile_ids: ["mario"] },
          { week_start: "2026-11-16", profile_ids: [] },
        ],
        MON,
      ),
    ).toMatchObject({ inForce: true, hasPast: true, pastTeam: false });
  });

  it("solo settimane future preparate: per ora valgono responsabile e supporti della scheda", () => {
    expect(gridState([{ week_start: "2026-11-30", profile_ids: ["mario"] }], MON)).toMatchObject({
      any: true,
      inForce: false,
      hasPast: false,
    });
    expect(gridState([{ week_start: MON, profile_ids: [] }], TUE)).toMatchObject({
      inForce: true,
    });
  });
});
