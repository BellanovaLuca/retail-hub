import { describe, expect, it } from "vitest";
import type { ShiftInput } from "@/lib/domain/types";
import {
  formatHours,
  hoursByPersonDay,
  intervalHours,
  personDayHours,
  personWeekHours,
  residualHoursByDay,
  shiftNetHours,
  totalContractHours,
} from "@/lib/hours";

const shift = (
  profileId: string,
  date: string,
  start: string,
  end: string,
  breakMinutes = 0,
): ShiftInput => ({
  profileId,
  date,
  start,
  end,
  breakMinutes,
  zone: "vista",
  backOffice: false,
  departmentId: null,
});

const days = [
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
];

describe("ore", () => {
  it("durata di una fascia: mezz'ora = 0,5", () => {
    expect(intervalHours({ start: "10:00", end: "14:00" })).toBe(4);
    expect(intervalHours({ start: "10:00", end: "10:30" })).toBe(0.5);
    expect(intervalHours({ start: "08:30", end: "10:00" })).toBe(1.5);
    expect(intervalHours({ start: "14:00", end: "10:00" })).toBe(0);
  });

  it("ore nette: durata meno pausa, mai negative", () => {
    expect(shiftNetHours(shift("a", days[0], "10:00", "20:00", 60))).toBe(9);
    expect(shiftNetHours(shift("a", days[0], "10:00", "20:00", 30))).toBe(9.5);
    expect(shiftNetHours(shift("a", days[0], "10:00", "10:30", 60))).toBe(0);
  });

  it("ore per persona, per giorno e per settimana (turni spezzati sommati)", () => {
    const shifts = [
      shift("a", days[0], "10:00", "13:00"),
      shift("a", days[0], "14:00", "19:00"),
      shift("a", days[1], "10:00", "20:00", 60),
      shift("b", days[0], "16:00", "20:00"),
    ];
    expect(personDayHours(shifts, "a", days[0])).toBe(8);
    expect(personWeekHours(shifts, "a")).toBe(17);
    expect(personWeekHours(shifts, "a", [days[1]])).toBe(9);
    expect(hoursByPersonDay(shifts)).toEqual({
      a: { [days[0]]: 8, [days[1]]: 9 },
      b: { [days[0]]: 4 },
    });
  });

  it("riga ORARIO: il residuo mostrato in testa al giorno è quello PRIMA del giorno", () => {
    const shifts = [0, 1, 2, 3, 4].map((i) => shift("a", days[i], "10:00", "18:00"));
    const rows = residualHoursByDay(40, shifts, days);
    expect(rows.map((r) => r.before)).toEqual([40, 32, 24, 16, 8, 0, 0]);
    expect(rows.map((r) => r.after)).toEqual([32, 24, 16, 8, 0, 0, 0]);
    expect(rows.map((r) => r.planned)).toEqual([8, 8, 8, 8, 8, 0, 0]);
  });

  it("il residuo può andare sotto zero; senza contratto è null", () => {
    const shifts = [0, 1].map((i) => shift("a", days[i], "10:00", "20:00", 60));
    expect(residualHoursByDay(16, shifts, days.slice(0, 3)).map((r) => r.after)).toEqual([
      7, -2, -2,
    ]);
    expect(residualHoursByDay(null, shifts, days.slice(0, 1))[0]).toEqual({
      date: days[0],
      planned: 9,
      before: null,
      after: null,
    });
  });

  it("totale ore di contratto", () => {
    expect(
      totalContractHours([{ weeklyHours: 40 }, { weeklyHours: 38.5 }, { weeklyHours: null }]),
    ).toBe(78.5);
  });

  it("formatHours usa la virgola italiana", () => {
    expect(formatHours(38.5)).toBe("38,5");
    expect(formatHours(40)).toBe("40");
    expect(formatHours(7.75)).toBe("7,75");
    expect(formatHours(0.1 + 0.2)).toBe("0,3");
    expect(formatHours(-2)).toBe("-2");
    expect(formatHours(-0)).toBe("0");
  });
});
