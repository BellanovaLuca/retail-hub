import { describe, expect, it } from "vitest";
import { buildAdminGridModel } from "@/lib/export/schedule-grid";
import {
  buildTimesheetModel,
  openingFor as modelOpeningFor,
  repaintBreak,
  shiftsFromMarks,
} from "@/lib/export/timesheet-model";
import { openingFor as ruleOpeningFor } from "@/lib/rules/common";
import type { RuleContext } from "@/lib/rules/types";
import { isHolidayClosure, openingFor, resolveOpening } from "@/lib/schedule/opening";
import { segmentsToMarkedSlots, slotIndex } from "@/lib/shifts/slots";

const TUE = "2026-12-08"; // Immacolata, martedì
const WED = "2026-12-09";
const standard = { open: "10:00", close: "20:00" };
const calendar = (over: {
  exceptions?: Record<string, { open: string; close: string } | null>;
  storeClosed?: boolean;
}) => ({
  openingHours: { "1": standard, "2": standard, "3": standard, "7": null },
  exceptions: over.exceptions ?? {},
  holidays: [{ date: TUE, label: "Immacolata", storeClosed: over.storeClosed ?? true }],
});

const ruleCtx = (cal: ReturnType<typeof calendar>): RuleContext => ({
  weekStart: "2026-12-07",
  days: [TUE, WED],
  shifts: [],
  leaves: [],
  people: [],
  departments: [],
  openingHours: {
    1: { start: "10:00", end: "20:00" },
    2: { start: "10:00", end: "20:00" },
    7: null,
  },
  openingExceptions: Object.fromEntries(
    Object.entries(cal.exceptions).map(([d, v]) => [d, v ? { start: v.open, end: v.close } : null]),
  ),
  holidays: cal.holidays,
  variables: {},
});

describe("orario di apertura: una sola precedenza per regole, foglio orario e griglie", () => {
  it("eccezione > festivo chiuso > orario standard", () => {
    expect(resolveOpening({ exception: undefined, closedHoliday: false, standard: "std" })).toBe(
      "std",
    );
    expect(
      resolveOpening({ exception: undefined, closedHoliday: true, standard: "std" }),
    ).toBeNull();
    expect(resolveOpening({ exception: "exc", closedHoliday: true, standard: "std" })).toBe("exc");
    expect(resolveOpening({ exception: null, closedHoliday: false, standard: "std" })).toBeNull();
    expect(
      resolveOpening({ exception: undefined, closedHoliday: false, standard: undefined }),
    ).toBeNull();
  });

  it("festivo chiuso con apertura straordinaria: aperto per tutti allo stesso modo", () => {
    const cal = calendar({ exceptions: { [TUE]: { open: "10:00", close: "19:00" } } });
    expect(openingFor(TUE, cal)).toEqual({ start: "10:00", end: "19:00" });
    expect(modelOpeningFor(TUE, cal)).toEqual({ start: "10:00", end: "19:00" });
    expect(ruleOpeningFor(ruleCtx(cal), TUE)).toEqual({ start: 600, end: 1140 });
    expect(isHolidayClosure(TUE, cal)).toBe(false);
  });

  it("festivo chiuso senza eccezioni, eccezione «chiuso», giorno senza orario", () => {
    const closed = calendar({});
    expect(openingFor(TUE, closed)).toBeNull();
    expect(ruleOpeningFor(ruleCtx(closed), TUE)).toBeNull();
    expect(isHolidayClosure(TUE, closed)).toBe(true);
    expect(openingFor(WED, closed)).toEqual({ start: "10:00", end: "20:00" });
    const shut = calendar({ storeClosed: false, exceptions: { [WED]: null } });
    expect(openingFor(WED, shut)).toBeNull();
    expect(ruleOpeningFor(ruleCtx(shut), WED)).toBeNull();
    // Chiuso per eccezione o per orario settimanale, non per festività.
    expect(isHolidayClosure(WED, shut)).toBe(false);
    expect(openingFor("2026-12-13", shut)).toBeNull(); // domenica senza orario
  });

  it("foglio orario ed export: «chiuso» segue la stessa regola", () => {
    const base = { days: [TUE], shifts: [], leaves: [], people: [], departments: [] };
    const reopened = calendar({ exceptions: { [TUE]: { open: "10:00", close: "19:00" } } });
    expect(buildTimesheetModel({ ...base, calendar: reopened }).days[0]).toMatchObject({
      closed: false,
      opening: { start: "10:00", end: "19:00" },
    });
    expect(buildTimesheetModel({ ...base, calendar: calendar({}) }).days[0]).toMatchObject({
      closed: true,
      opening: null,
    });
    const week = ["2026-12-07", TUE, WED, "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"];
    const grid = (cal: ReturnType<typeof calendar>) =>
      buildAdminGridModel({ ...base, days: week, templates: [], calendar: cal }).days[1].closed;
    expect(grid(reopened)).toBe(false);
    expect(grid(calendar({}))).toBe(true);
  });
});

describe("foglio orario: turni ottimistici di una giornata ridipinta", () => {
  const base = { profileId: "a", date: WED, zone: null, departmentId: null, breakMinutes: 60 };
  it("con i turni com'erano gli estremi non toccati restano quelli veri", () => {
    const original = [{ start: "10:15", end: "18:45", backOffice: false }];
    const marks = segmentsToMarkedSlots(original);
    marks[slotIndex("20:00")] = "sale";
    const out = shiftsFromMarks(marks, base, original);
    expect(out.map((s) => [s.start, s.end])).toEqual([
      ["10:15", "18:45"],
      ["20:00", "20:30"],
    ]);
    // I pezzi sono cambiati (da 1 a 2): il vuoto dipinto è la pausa, quella di prima decade.
    expect(out.map((s) => s.breakMinutes)).toEqual([0, 0]);
  });
  it("la pausa resta se il numero di pezzi non cambia", () => {
    const original = [{ start: "10:15", end: "18:45", backOffice: false }];
    const marks = segmentsToMarkedSlots(original);
    marks[slotIndex("19:00")] = "sale";
    expect(shiftsFromMarks(marks, base, original)).toMatchObject([
      { start: "10:15", end: "19:30", breakMinutes: 60 },
    ]);
    expect(repaintBreak(60, original, 1)).toBe(60);
    expect(repaintBreak(60, original, 2)).toBe(0);
    expect(
      repaintBreak(30, [...original, { start: "19:00", end: "20:00", backOffice: false }], 2),
    ).toBe(30);
    expect(repaintBreak(60, undefined, 1)).toBe(60);
  });
});
