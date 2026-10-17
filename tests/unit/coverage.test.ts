import { describe, expect, it } from "vitest";
import {
  computeCoverage,
  coverageByHour,
  dailyTotals,
  personHourCells,
  workingDepartment,
} from "@/lib/coverage";
import type { DepartmentRef, PersonInput, ShiftInput } from "@/lib/domain/types";

const D = "2026-09-22";
const departments: DepartmentRef[] = [
  { id: "man", name: "Management" },
  { id: "ott", name: "Ottici" },
  { id: "adv", name: "Addetti vendita" },
];
const people: PersonInput[] = [
  {
    id: "boss",
    displayName: "Boss",
    weeklyHours: 40,
    homeZone: "vista",
    departmentIds: ["man", "ott"],
    primaryDepartmentId: "man",
  },
  {
    id: "bo",
    displayName: "Paola",
    weeklyHours: 40,
    homeZone: "vista",
    departmentIds: ["man", "adv"],
    primaryDepartmentId: "man",
  },
  {
    id: "ott",
    displayName: "Otto",
    weeklyHours: 40,
    homeZone: "vista",
    departmentIds: ["ott"],
    primaryDepartmentId: "ott",
  },
  {
    id: "jolly",
    displayName: "Jo",
    weeklyHours: 30,
    homeZone: "jolly",
    departmentIds: ["adv"],
    primaryDepartmentId: "adv",
  },
];

const s = (
  profileId: string,
  start: string,
  end: string,
  extra: Partial<ShiftInput> = {},
): ShiftInput => ({
  profileId,
  date: D,
  start,
  end,
  breakMinutes: 0,
  zone: null,
  backOffice: false,
  departmentId: null,
  ...extra,
});

const at = (slots: ReturnType<typeof computeCoverage>, start: string) =>
  slots.find((x) => x.start === start)!;

describe("computeCoverage", () => {
  const shifts = [
    s("bo", "08:30", "10:00", { backOffice: true }),
    s("bo", "10:00", "17:30"),
    s("ott", "10:00", "13:00"),
    s("ott", "14:00", "19:00"),
    s("jolly", "12:00", "20:00", { zone: "sole", breakMinutes: 60 }),
    s("boss", "10:00", "20:00", { breakMinutes: 60 }),
  ];
  const slots = computeCoverage({ date: D, shifts, people, departments });

  it("mezz'ore dalle 07:00 alle 22:00", () => {
    expect(slots).toHaveLength(30);
    expect(slots[0]).toMatchObject({ start: "07:00", end: "07:30", teste: 0, copOtt: false });
  });

  it("back office in apertura: conta in TESTE ma non in DELTA", () => {
    expect(at(slots, "08:30")).toMatchObject({ teste: 1, delta: 0, vista: 0, backOffice: 1 });
  });

  it("dalle 10 la stessa persona è in vendita e conta", () => {
    expect(at(slots, "10:00")).toMatchObject({ teste: 3, delta: 3, vista: 3, sole: 0 });
  });

  it("i jolly contano nell'area del turno; la pausa senza posizione non toglie presenza", () => {
    expect(at(slots, "13:00")).toMatchObject({ teste: 3, delta: 3, vista: 2, sole: 1 });
    expect(at(slots, "19:30")).toMatchObject({ teste: 2, sole: 1, vista: 1 });
  });

  it("COP. OTT.: il manager anche ottico conta come ottico", () => {
    expect(at(slots, "13:00")).toMatchObject({ ottici: 1, copOtt: true });
    expect(at(slots, "10:00").ottici).toBe(2);
  });

  it("se il turno indica Addetti vendita, il manager-ottico non conta come ottico", () => {
    const only = computeCoverage({
      date: D,
      shifts: [s("boss", "10:00", "20:00", { departmentId: "adv" })],
      people,
      departments,
    });
    expect(at(only, "10:00")).toMatchObject({ teste: 1, ottici: 0, copOtt: false });
  });

  it("una persona con turno di vendita e di back office sovrapposti conta in vendita", () => {
    const both = computeCoverage({
      date: D,
      shifts: [s("bo", "10:00", "12:00", { backOffice: true }), s("bo", "10:00", "11:00")],
      people,
      departments,
    });
    expect(at(both, "10:00")).toMatchObject({ teste: 1, delta: 1 });
    expect(at(both, "11:00")).toMatchObject({ teste: 1, delta: 0, backOffice: 1 });
  });

  it("una fascia coperta solo in parte non conta (turno 10:15)", () => {
    const partial = computeCoverage({
      date: D,
      shifts: [s("ott", "10:15", "12:00")],
      people,
      departments,
    });
    expect(at(partial, "10:00").teste).toBe(0);
    expect(at(partial, "10:30").teste).toBe(1);
  });

  it("ignora i turni di altri giorni; passo e intervallo configurabili", () => {
    const hourly = computeCoverage({
      date: D,
      shifts: [...shifts, s("ott", "10:00", "20:00", { date: "2026-09-23" })],
      people,
      departments,
      slotMinutes: 60,
      from: "10:00",
      to: "20:00",
    });
    expect(hourly).toHaveLength(10);
    expect(hourly[0]).toMatchObject({ start: "10:00", end: "11:00", teste: 3 });
  });

  it("aggregazione per ora intera: il minimo delle mezz'ore", () => {
    const byHour = coverageByHour(slots);
    expect(byHour).toHaveLength(15);
    const h17 = byHour.find((h) => h.start === "17:00")!;
    // 17:00–17:30 Paola c'è, 17:30–18:00 no
    expect(h17).toMatchObject({ teste: 3, end: "18:00" });
  });
});

describe("workingDepartment", () => {
  it("reparto del turno, poi principale; Management → altro reparto", () => {
    expect(workingDepartment({ departmentId: null }, people[2], departments)).toEqual({
      raw: "ott",
      effective: "ott",
    });
    expect(workingDepartment({ departmentId: null }, people[0], departments)).toEqual({
      raw: "man",
      effective: "ott",
    });
    expect(workingDepartment({ departmentId: null }, people[1], departments)).toEqual({
      raw: "man",
      effective: "adv",
    });
    expect(workingDepartment({ departmentId: "adv" }, people[0], departments).effective).toBe(
      "adv",
    );
  });
});

describe("totali del giorno", () => {
  const shifts = [
    s("bo", "08:30", "10:00", { backOffice: true }),
    s("bo", "10:00", "17:30"),
    s("boss", "10:00", "20:00", { breakMinutes: 60 }),
    s("ott", "10:00", "13:00", { date: "2026-09-23" }),
  ];

  it("riga TOT: ore per persona e totale negozio (back office compreso)", () => {
    expect(dailyTotals(D, shifts)).toEqual({ byPerson: { bo: 9, boss: 9 }, total: 18 });
  });

  it("celle ORA di una persona: 1 / 0,5", () => {
    const cells = personHourCells(shifts, "bo", D);
    expect(cells).toHaveLength(15);
    expect(cells.find((c) => c.hour === 8)!.value).toBe(0.5);
    expect(cells.find((c) => c.hour === 9)!.value).toBe(1);
    expect(cells.find((c) => c.hour === 17)!.value).toBe(0.5);
    expect(cells.reduce((sum, c) => sum + c.value, 0)).toBe(9);
  });
});
