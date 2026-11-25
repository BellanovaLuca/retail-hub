/**
 * Casi riprodotti nell'audit di turni, ferie e richieste (28–29/11/2026): pausa dei turni
 * spezzati, back office ereditato, avvisi ignorati per persona, assenze scritte nel foglio turni
 * viste dalle regole, messaggi dell'approvazione di uno scambio.
 */
import { describe, expect, it } from "vitest";
import { buildDayRows, type ExistingShift } from "@/app/admin/turni/day-rows";
import type { PersonInput, ShiftInput } from "@/lib/domain/types";
import { dayNetHours } from "@/lib/hours";
import { swapErrorMessage } from "@/lib/requests";
import { evaluateRules, overrideCovers } from "@/lib/rules/registry";
import type { RuleContext, RuleRecord } from "@/lib/rules/types";
import { shiftRecordsToInputs } from "@/lib/schedule/adapters";
import { sortShifts } from "@/lib/schedule/cells";
import type { SchedulePerson, ShiftRecord, TemplateRecord } from "@/lib/schedule/types";
import { dayBreakMinutes, withAbsenceShifts } from "@/lib/schedule/view";
import { parseShiftCell } from "@/lib/shifts/parse";

const P = "00000000-0000-0000-0000-0000000000e1";
const D = "2026-11-30";

describe("pausa di una giornata con più pezzi", () => {
  const segments = [
    { start: "10:00", end: "13:00", isBackOffice: false },
    { start: "14:00", end: "20:00", isBackOffice: false },
  ];
  const saved = buildDayRows(
    P,
    D,
    [],
    segments,
    { templateId: null, breakMinutes: 30, departmentId: null, zone: "vista", note: null },
    undefined,
  );

  it("al salvataggio la pausa sta sul pezzo più lungo, che non è il primo", () => {
    expect(saved.map((r) => [r.start_time, r.break_minutes])).toEqual([
      ["10:00", 0],
      ["14:00", 30],
    ]);
  });

  it("dayBreakMinutes la rilegge per intero (il primo pezzo da solo darebbe 0)", () => {
    const records = saved.map((r) => ({ start: r.start_time, breakMinutes: r.break_minutes }));
    expect(sortShifts(records)[0].breakMinutes).toBe(0);
    expect(dayBreakMinutes(records)).toBe(30);
    // Anche con i nomi di colonna dell'istantanea pubblicata.
    expect(dayBreakMinutes(saved)).toBe(30);
    expect(dayBreakMinutes([])).toBe(0);
  });

  it("riaprire il dettaglio e salvare (cambiando solo la nota) non azzera la pausa", () => {
    const again = buildDayRows(
      P,
      D,
      saved,
      segments,
      {
        templateId: null,
        breakMinutes: dayBreakMinutes(saved),
        departmentId: null,
        zone: "vista",
        note: "vetrine",
      },
      undefined,
    );
    const hours = (rows: typeof saved) =>
      dayNetHours(
        rows.map((r) => ({
          start: r.start_time!,
          end: r.end_time!,
          breakMinutes: r.break_minutes,
        })),
      );
    expect(hours(again)).toBe(hours(saved));
    expect(hours(again)).toBe(8.5);
  });
});

describe("back office ereditato dalla giornata di prima", () => {
  const piece = (over: Partial<ExistingShift>): ExistingShift => ({
    template_id: null,
    start_time: "10:00:00",
    end_time: "19:00:00",
    break_minutes: 0,
    working_as_department_id: null,
    zone: "vista",
    is_back_office: null,
    note: null,
    ...over,
  });
  const fromCell = (text: string, existing: ExistingShift[]) => {
    const parsed = parseShiftCell(text, []);
    if (parsed.kind !== "times") throw new Error("cella non valida");
    return buildDayRows(
      P,
      D,
      existing,
      parsed.segments,
      { templateId: null, breakMinutes: 0, keepDetailsIfSameTimes: true },
      "vista",
    );
  };

  it("giornata mista «8:30–10 BO · 10–17:30»: un orario nuovo non finisce tutto in back office", () => {
    const mixed = [
      piece({ start_time: "08:30:00", end_time: "10:00:00", is_back_office: true }),
      piece({ start_time: "10:00:00", end_time: "17:30:00", is_back_office: false }),
    ];
    expect(fromCell("10-18", mixed).map((r) => [r.start_time, r.is_back_office])).toEqual([
      ["10:00", null],
    ]);
  });

  it("giornata tutta in back office: un orario nuovo resta in back office", () => {
    const allBo = [
      piece({ start_time: "08:30:00", end_time: "12:00:00", is_back_office: true }),
      piece({ start_time: "13:00:00", end_time: "17:00:00", is_back_office: true }),
    ];
    expect(fromCell("9-18", allBo)[0].is_back_office).toBe(true);
    expect(fromCell("9-18", [piece({ is_back_office: false })])[0].is_back_office).toBe(false);
  });

  it("il marcatore BO scritto nella cella vince comunque", () => {
    const rows = fromCell("8-10 BO 10-18", [piece({ is_back_office: false })]);
    expect(rows.map((r) => r.is_back_office)).toEqual([true, false]);
  });
});

/* ------------------------------------------------------------------- regole */

const DAYS = [
  "2026-11-30",
  "2026-12-01",
  "2026-12-02",
  "2026-12-03",
  "2026-12-04",
  "2026-12-05",
  "2026-12-06",
];
const person = (id: string, displayName: string): PersonInput => ({
  id,
  displayName,
  weeklyHours: 40,
  homeZone: "vista",
  departmentIds: ["d"],
  primaryDepartmentId: "d",
});
const shift = (profileId: string, date: string): ShiftInput => ({
  profileId,
  date,
  start: "10:00",
  end: "19:00",
  breakMinutes: 60,
  zone: "vista",
  backOffice: false,
  departmentId: null,
});
const hoursRule: RuleRecord = {
  id: "r-ore",
  name: "Ore ±10%",
  type: "weekly_hours_deviation",
  params: { pct: 10 },
  days: [],
  timeWindows: [],
  validFrom: null,
  validTo: null,
  severity: "warning",
  active: true,
};
const context = (over: Partial<RuleContext>): RuleContext => ({
  weekStart: DAYS[0],
  days: DAYS,
  shifts: [],
  leaves: [],
  people: [person("a", "Anna"), person("b", "Bruno")],
  departments: [{ id: "d", name: "Ottici" }],
  openingHours: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((d) => [d, { start: "10:00", end: "20:00" }]),
  ),
  holidays: [],
  variables: {},
  ...over,
});

describe("avvisi ignorati per persona", () => {
  // Anna 48 ore, Bruno 24: tutti e due fuori dal ±10%.
  const ctx = context({
    shifts: [
      ...DAYS.slice(0, 6).map((d) => shift("a", d)),
      ...DAYS.slice(0, 3).map((d) => shift("b", d)),
    ],
  });

  it("ignorare l'avviso di Anna lascia quello di Bruno", () => {
    expect(evaluateRules(ctx, [hoursRule]).map((v) => v.profileId)).toEqual(["a", "b"]);
    const left = evaluateRules(ctx, [hoursRule], {
      overrides: [{ ruleId: "r-ore", date: null, profileId: "a" }],
    });
    expect(left.map((v) => v.profileId)).toEqual(["b"]);
  });

  it("senza persona (avvisi ignorati prima, regole di negozio) vale per tutti", () => {
    expect(
      evaluateRules(ctx, [hoursRule], { overrides: [{ ruleId: "r-ore", date: null }] }),
    ).toEqual([]);
    expect(
      evaluateRules(ctx, [hoursRule], {
        overrides: [{ ruleId: "r-ore", date: null, profileId: null }],
      }),
    ).toEqual([]);
  });

  it("overrideCovers: regola, giorno e persona devono coincidere", () => {
    const v = {
      ruleId: "r",
      ruleName: "R",
      ruleType: "min_rest_between_shifts",
      severity: "warning" as const,
      date: "2026-12-01",
      profileId: "a",
      message: "",
    };
    expect(overrideCovers({ ruleId: "r", date: "2026-12-01", profileId: "a" }, v)).toBe(true);
    expect(overrideCovers({ ruleId: "r", date: "2026-12-01", profileId: "b" }, v)).toBe(false);
    expect(overrideCovers({ ruleId: "r", date: "2026-12-02", profileId: "a" }, v)).toBe(false);
    expect(overrideCovers({ ruleId: "altra", date: null }, v)).toBe(false);
    // Un avviso ignorato per una persona non copre un avviso di negozio (senza persona).
    expect(
      overrideCovers(
        { ruleId: "r", date: "2026-12-01", profileId: "a" },
        { ...v, profileId: undefined },
      ),
    ).toBe(false);
  });
});

describe("assenze scritte nel foglio turni come turno rapido", () => {
  const record = (over: Partial<ShiftRecord>): ShiftRecord => ({
    id: `${over.date}`,
    profileId: "b",
    date: DAYS[0],
    templateId: null,
    start: "10:00",
    end: "19:00",
    breakMinutes: 60,
    departmentId: null,
    zone: null,
    isBackOffice: null,
    note: null,
    conflict: false,
    ...over,
  });
  const ferie: TemplateRecord = {
    id: "t-f",
    code: "F",
    label: "Ferie",
    startTime: null,
    endTime: null,
    breakMinutes: 0,
    isAbsence: true,
  };
  // Bruno: tre giorni di lavoro, poi «F» giovedì e venerdì scritti nel foglio turni.
  const records = [
    ...DAYS.slice(0, 3).map((date) => record({ date })),
    ...DAYS.slice(3, 5).map((date) => record({ date, templateId: "t-f", start: null, end: null })),
  ];
  const bruno: SchedulePerson = {
    id: "b",
    displayName: "Bruno",
    shortLabel: "BRUNO",
    color: null,
    homeZone: "vista",
    weeklyHours: 40,
    countsForCoverage: true,
    primaryDepartmentId: "d",
    departmentIds: ["d"],
  };
  const shifts = shiftRecordsToInputs(records, new Map([["b", bruno]]));

  it("senza contarle la regola delle ore segnala 24 su 40", () => {
    const out = evaluateRules(context({ people: [person("b", "Bruno")], shifts }), [hoursRule]);
    expect(out.map((v) => v.actual)).toEqual([24]);
  });

  it("con le assenze del foglio (come fa buildRuleContext) valgono come ferie: nessun avviso", () => {
    const leaves = withAbsenceShifts([], records, new Map([[ferie.id, ferie]])).map((l) => ({
      profileId: l.profileId,
      date: l.date,
      type: l.type,
      hours: l.hours,
      status: l.status,
    }));
    expect(leaves.map((l) => [l.date, l.type])).toEqual([
      [DAYS[3], "ferie"],
      [DAYS[4], "ferie"],
    ]);
    expect(
      evaluateRules(context({ people: [person("b", "Bruno")], shifts, leaves }), [hoursRule]),
    ).toEqual([]);
  });
});

describe("swapErrorMessage", () => {
  it("riporta il motivo del database invece di «Decisione non salvata»", () => {
    expect(
      swapErrorMessage({ code: "P0001", message: "Il collega ha già un turno il 30/11" }),
    ).toMatch(/^Il collega ha già un turno il 30\/11: /);
    expect(
      swapErrorMessage({
        code: "P0001",
        message: "Chi chiede lo scambio ha già un turno il 02/12",
      }),
    ).toMatch(/^Chi chiede lo scambio ha già un turno il 02\/12: /);
    expect(
      swapErrorMessage({
        code: "P0001",
        message: "Turni dello scambio non trovati: il turno di chi chiede non c'è più",
      }),
    ).toBe("I turni dello scambio non esistono più: controlla il foglio turni.");
  });

  it("gli altri errori restano al messaggio generico", () => {
    expect(swapErrorMessage({ code: "42501", message: "permission denied" })).toBeNull();
    expect(swapErrorMessage({ code: "23505", message: "ha già un turno il …" })).toBeNull();
    expect(swapErrorMessage({})).toBeNull();
  });
});
