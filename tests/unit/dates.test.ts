import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";
import {
  dayLetter,
  formatLong,
  isoWeekday,
  toISODate,
  weekDays,
  weekNumber,
  weekStart,
} from "@/lib/dates";

/** Ora "da orologio" a Roma: "2026-10-18T23:30" → 23:30 ora italiana. */
const rome = (local: string) => {
  const [y, mo, d, h, mi] = local.split(/[-T:]/).map(Number);
  return new TZDate(y, mo - 1, d, h, mi, "Europe/Rome");
};

describe("settimane lunedì → domenica", () => {
  it("la domenica appartiene alla settimana del lunedì precedente", () => {
    expect(toISODate(weekStart(rome("2026-10-18T12:00")))).toBe("2026-10-12");
  });

  it("il lunedì è l'inizio della propria settimana", () => {
    expect(toISODate(weekStart(rome("2026-10-12T00:30")))).toBe("2026-10-12");
  });

  it("restituisce 7 giorni da lunedì a domenica", () => {
    const days = weekDays(rome("2026-10-14T09:00")).map(toISODate);
    expect(days).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("calcola il numero di settimana", () => {
    expect(weekNumber(rome("2026-09-24T10:00"))).toBe(39);
  });

  it("il cambio di settimana segue l'ora di Roma, non l'UTC", () => {
    // 00:30 di lunedì 19 a Roma = 22:30 UTC di domenica: per il negozio è già la nuova settimana.
    expect(toISODate(weekStart(rome("2026-10-19T00:30")))).toBe("2026-10-19");
    // 23:30 di domenica 18 a Roma = 21:30 UTC: ancora la settimana del 12.
    expect(toISODate(weekStart(rome("2026-10-18T23:30")))).toBe("2026-10-12");
  });
});

describe("formati italiani", () => {
  it("giorno della settimana e lettere", () => {
    const sunday = rome("2026-10-18T10:00");
    expect(isoWeekday(sunday)).toBe(7);
    expect(dayLetter(sunday)).toBe("D");
    expect(formatLong(sunday)).toBe("domenica 18 ottobre");
  });
});
