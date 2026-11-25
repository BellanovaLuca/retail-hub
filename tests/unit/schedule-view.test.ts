import { describe, expect, it } from "vitest";
import type { LeaveRecord, ShiftRecord, TemplateRecord } from "@/lib/schedule/types";
import {
  absenceTypeOf,
  formatHoursIt,
  weekHoursByPerson,
  withAbsenceShifts,
} from "@/lib/schedule/view";

const tpl = (id: string, code: string, label: string, isAbsence = true): TemplateRecord => ({
  id,
  code,
  label,
  startTime: isAbsence ? null : "10:00",
  endTime: isAbsence ? null : "20:00",
  breakMinutes: 0,
  isAbsence,
});
const templates = new Map(
  [
    tpl("f", "F", "Ferie"),
    tpl("ma", "MA", "Malattia"),
    tpl("fo", "FO", "Formazione"),
    tpl("man", "MAN", "Manager", false),
  ].map((t) => [t.id, t]),
);
const shift = (profileId: string, date: string, templateId: string | null, start?: string) =>
  ({
    id: `${profileId}-${date}`,
    profileId,
    date,
    templateId,
    start: start ?? null,
    end: start ? "20:00" : null,
    breakMinutes: 0,
    departmentId: null,
    zone: null,
    isBackOffice: null,
    note: null,
    conflict: false,
  }) satisfies ShiftRecord;

describe("assenze scritte come turno rapido (foglio orario e PDF)", () => {
  it("riconosce il tipo dal codice o dall'etichetta", () => {
    expect(absenceTypeOf({ code: "F", label: "x" })).toBe("ferie");
    expect(absenceTypeOf({ code: "PE", label: "x" })).toBe("permesso");
    expect(absenceTypeOf({ code: "MAL", label: "Malattia" })).toBe("malattia");
    expect(absenceTypeOf({ code: "FO", label: "Formazione" })).toBe("altro");
  });

  it("aggiunge le assenze dei turni rapidi, senza toccare quelle del planning", () => {
    const planning: LeaveRecord = {
      profileId: "a",
      date: "2026-10-12",
      type: "ferie",
      hours: null,
      status: "confirmed",
      source: "request",
    };
    const out = withAbsenceShifts(
      [planning],
      [
        shift("a", "2026-10-12", "ma"), // il planning ha la precedenza
        shift("b", "2026-10-12", "f"),
        shift("c", "2026-10-13", "man", "10:00"), // turno di lavoro: ignorato
        shift("d", "2026-10-14", null, "12:00"),
      ],
      templates,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(planning);
    expect(out[1]).toMatchObject({ profileId: "b", type: "ferie", hours: null, fromShift: true });
  });
});

describe("ore nel foglio turni, in «I miei orari» e negli export", () => {
  it("formatHoursIt non arrotonda alla mezz'ora", () => {
    expect(formatHoursIt(7.75)).toBe("7,75");
    expect(formatHoursIt(8.25)).toBe("8,25");
    expect(formatHoursIt(39.75)).toBe("39,75");
    expect(formatHoursIt(37.5)).toBe("37,5");
    expect(formatHoursIt(40)).toBe("40");
  });

  it("weekHoursByPerson: la pausa vale per la giornata", () => {
    const piece = (date: string, start: string, end: string, breakMinutes = 0): ShiftRecord => ({
      ...shift("a", date, null, start),
      id: `${date}-${start}`,
      end,
      breakMinutes,
    });
    const hours = weekHoursByPerson([
      piece("2026-10-12", "10:00", "10:30", 60),
      piece("2026-10-12", "11:00", "19:00"),
      piece("2026-10-13", "10:00", "18:15", 30),
      shift("a", "2026-10-14", "f"),
    ]);
    expect(hours.get("a")).toBe(7.5 + 7.75);
  });
});
