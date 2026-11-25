/**
 * Scelte del 29/11/2026: firma degli orari dello scambio (se il turno cambia dopo
 * l'accettazione il collega deve accettare di nuovo) e assenze di poche ore dei colleghi
 * visibili insieme al turno.
 */
import { describe, expect, it } from "vitest";
import { shopCellText } from "@/app/(app)/orari/negozio/shop-grid";
import {
  cellText,
  chipSuffix,
  leaveDescription,
  type PlannerLeave,
} from "@/components/leaves/types";
import { buildPublishedGridModel } from "@/lib/export/schedule-grid";
import { leavePublicText } from "@/lib/leaves/parse";
import { countOnLeaveByDay } from "@/lib/leaves/plan";
import {
  isSwapChangedError,
  shiftTimesText,
  swapErrorMessage,
  swapShiftLines,
  swapSignature,
} from "@/lib/requests";
import type { PublishedShift, SchedulePerson } from "@/lib/schedule/types";

describe("firma degli orari dello scambio", () => {
  const A = "anna";
  const B = "bruno";
  const shifts = [
    { profileId: B, date: "2027-07-07", start: "14:00:00", end: "18:00:00" },
    { profileId: A, date: "2027-07-06", start: "10:00:00", end: "14:00:00" },
    { profileId: B, date: "2027-07-07", start: "09:00:00", end: "13:00:00" },
    // riposo scritto nel foglio e turni di altri giorni: non entrano nella firma
    { profileId: A, date: "2027-07-07", start: null, end: null },
    { profileId: A, date: "2027-07-08", start: "10:00", end: "19:00" },
  ];

  // Gli stessi valori verificati sul database in tests/db/turni_scelte.test.sql.
  it("stesso formato della funzione SQL swap_signature", () => {
    expect(
      swapSignature({
        shifts,
        requesterId: A,
        startDate: "2027-07-06",
        targetId: B,
        targetDate: "2027-07-07",
      }),
    ).toBe("10:00-14:00|09:00-13:00,14:00-18:00");
    expect(
      swapSignature({
        shifts,
        requesterId: A,
        startDate: "2027-07-06",
        targetId: B,
        targetDate: null,
      }),
    ).toBe("10:00-14:00|");
    expect(
      swapSignature({
        shifts,
        requesterId: A,
        startDate: "2027-07-09",
        targetId: B,
        targetDate: null,
      }),
    ).toBe("|");
  });

  it("cambia se cambia un orario, non se cambia l'ordine delle righe", () => {
    const base = { requesterId: A, startDate: "2027-07-06", targetId: B, targetDate: "2027-07-07" };
    const before = swapSignature({ shifts, ...base });
    expect(swapSignature({ shifts: [...shifts].reverse(), ...base })).toBe(before);
    const moved = shifts.map((s) =>
      s.profileId === A && s.date === "2027-07-06" ? { ...s, start: "14:00", end: "20:00" } : s,
    );
    expect(swapSignature({ shifts: moved, ...base })).not.toBe(before);
  });

  it("riconosce il rifiuto del database per turno cambiato", () => {
    const error = {
      code: "P0001",
      message:
        "Il turno dello scambio è cambiato dopo l'accettazione del collega: deve accettare di nuovo",
    };
    expect(isSwapChangedError(error)).toBe(true);
    expect(isSwapChangedError({ message: "Il collega ha già un turno il 30/11" })).toBe(false);
    expect(isSwapChangedError(null)).toBe(false);
    // Se la richiesta non si può riportare in attesa, il motivo resta leggibile.
    expect(swapErrorMessage(error)).toBe(`${error.message}.`);
  });

  it("righe «giorno: orari» per avvisare i due colleghi", () => {
    expect(
      shiftTimesText([
        { start: "16:00", end: "20:00" },
        { start: "10:00:00", end: "14:00:00" },
      ]),
    ).toBe("10:00–14:00 · 16:00–20:00");
    expect(
      swapShiftLines({
        shifts,
        requester: { id: A, name: "Anna" },
        target: { id: B, name: "Bruno" },
        startDate: "2027-07-06",
        targetDate: "2027-07-07",
      }),
    ).toEqual([
      "Turno di Anna · 6 lug: 10:00–14:00",
      "Turno di Bruno · 7 lug: 09:00–13:00 · 14:00–18:00",
    ]);
    expect(
      swapShiftLines({
        shifts: [],
        requester: { id: A, name: "Anna" },
        target: { id: B, name: "Bruno" },
        startDate: "2027-07-06",
        targetDate: null,
      }),
    ).toEqual(["Turno di Anna · 6 lug: nessun turno"]);
  });
});

/* ------------------------------------------------------------ assenze di poche ore */

const DAY = "2026-12-07";
const shift = (over: Partial<PublishedShift> = {}): PublishedShift => ({
  id: "s1",
  profile_id: "bruno",
  date: DAY,
  start_time: "10:00",
  end_time: "19:00",
  break_minutes: 0,
  template_code: null,
  template_label: null,
  is_absence: false,
  zone: "vista",
  is_back_office: false,
  department_id: null,
  note: null,
  changed: false,
  ...over,
});
const leave = (kind: "ferie" | "assente", hours: number | null) => ({
  profileId: "bruno",
  date: DAY,
  kind,
  status: "confirmed" as const,
  hours,
});
const rest = shift({
  start_time: null,
  end_time: null,
  is_absence: true,
  template_code: "R",
  template_label: "Riposo",
});

describe("come i colleghi vedono un'assenza", () => {
  it("leavePublicText: mai il motivo, le ore se sono poche", () => {
    expect(leavePublicText("ferie", null)).toBe("Ferie");
    expect(leavePublicText("assente", null)).toBe("Assente");
    expect(leavePublicText("assente", 2)).toBe("Assente 2 h");
    expect(leavePublicText("assente", 4.5)).toBe("Assente 4,5 h");
    expect(leavePublicText("ferie", 4)).toBe("Ferie 4 h");
    expect(leavePublicText("assente", 0)).toBe("Assente");
  });

  it("griglia del negozio: poche ore = turno e assenza insieme", () => {
    expect(shopCellText([shift()], leave("assente", 2))).toBe("10–19 · Assente 2 h");
    expect(shopCellText([], leave("assente", 2))).toBe("Assente 2 h");
    expect(shopCellText([rest], leave("assente", 2))).toBe("Assente 2 h");
  });

  it("griglia del negozio: la giornata intera prevale sul turno ancora pubblicato", () => {
    expect(shopCellText([shift()], leave("ferie", null))).toBe("Ferie");
    expect(shopCellText([shift()], leave("assente", null))).toBe("Assente");
    expect(shopCellText([], leave("ferie", null))).toBe("Ferie");
  });

  it("griglia del negozio: senza assenze resta il turno (o il riposo)", () => {
    expect(shopCellText([shift()], undefined)).toBe("10–19");
    expect(shopCellText([rest], undefined)).toBe("Riposo");
    expect(shopCellText([], undefined)).toBe("");
  });

  it("PDF degli orari pubblicati: stesse regole, e i presenti non contano chi è assente tutto il giorno", () => {
    const people: SchedulePerson[] = ["anna", "bruno", "carla"].map((id) => ({
      id,
      displayName: id,
      shortLabel: id.toUpperCase(),
      color: null,
      homeZone: "vista",
      weeklyHours: null,
      countsForCoverage: true,
      primaryDepartmentId: "d",
      departmentIds: ["d"],
    }));
    const days = Array.from({ length: 7 }, (_, i) => `2026-12-${String(7 + i).padStart(2, "0")}`);
    const model = buildPublishedGridModel({
      days,
      shifts: [
        shift({ id: "a", profile_id: "anna" }),
        shift({ id: "b", profile_id: "bruno" }),
        shift({ id: "c", profile_id: "carla" }),
        { ...rest, id: "r", profile_id: "anna", date: days[1] },
      ],
      leaves: [
        { ...leave("assente", 2), profileId: "anna" },
        { ...leave("ferie", null), profileId: "bruno" },
        { ...leave("assente", 3.5), profileId: "carla", date: days[2] },
      ],
      people,
      departments: [{ id: "d", name: "Ottici" }],
    });
    const cells = (id: string) =>
      model.groups.flatMap((g) => g.rows).find((r) => r.id === id)!.cells;
    expect(cells("anna")[0]).toEqual({ text: "10–19 · Assente 2 h", tone: "shift" });
    expect(cells("anna")[1]).toEqual({ text: "Riposo", tone: "absence" });
    expect(cells("bruno")[0]).toEqual({ text: "Ferie", tone: "absence" });
    expect(cells("carla")[0]).toEqual({ text: "10–19", tone: "shift" });
    expect(cells("carla")[2]).toEqual({ text: "Assente 3,5 h", tone: "absence" });
    // Lunedì: Anna e Carla presenti, Bruno in ferie.
    expect(model.footer[0]).toEqual({
      label: "Presenti",
      cells: ["2", "0", "0", "0", "0", "0", "0"],
    });
  });

  it("planning ferie dei dipendenti: ore visibili, conteggio «in ferie» solo a giornata intera", () => {
    const pub = (type: PlannerLeave["type"], hours: number | null): PlannerLeave => ({
      profileId: "bruno",
      date: DAY,
      type,
      hours,
      status: "confirmed",
      source: null,
    });
    expect(cellText(pub("assente", 2), "employee")).toBe("Assente 2 h");
    expect(cellText(pub("assente", null), "employee")).toBe("Assente");
    expect(cellText(pub("ferie", null), "employee")).toBe("Ferie");
    expect(chipSuffix(pub("assente", 2), "employee")).toBe("assente 2 h");
    expect(chipSuffix(pub("assente", null), "employee")).toBe("assente");
    expect(chipSuffix(pub("ferie", null), "employee")).toBeNull();
    expect(leaveDescription(pub("assente", 2), "employee")).toBe("Assente 2 h");
    // L'admin continua a vedere i codici.
    expect(cellText({ ...pub("permesso", 2), source: "planning" }, "admin")).toBe("PE2");
    expect(chipSuffix({ ...pub("permesso", 2), source: "planning" }, "admin")).toBe("PE2");
    const counts = countOnLeaveByDay(
      [
        { profileId: "a", date: DAY, type: "ferie", hours: null },
        { profileId: "b", date: DAY, type: "ferie", hours: 4 },
      ],
      () => "d",
    );
    expect(counts.get(DAY)?.total).toBe(1);
  });
});
