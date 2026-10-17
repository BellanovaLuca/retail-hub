/**
 * Export dei turni (§8.1): modello del foglio orario, Excel (riletto con exceljs) e PDF.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildAdminGridModel, buildPublishedGridModel } from "@/lib/export/schedule-grid";
import { renderGridPdf, renderWeekPdf } from "@/lib/export/schedule-pdf";
import { buildScheduleXlsx } from "@/lib/export/schedule-xlsx";
import { buildTimesheetModel, timesheetGroups } from "@/lib/export/timesheet-model";
import type {
  LeaveRecord,
  PublishedShift,
  SchedulePerson,
  ShiftRecord,
  TemplateRecord,
} from "@/lib/schedule/types";

const DAYS = [
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
  "2026-10-25",
];
const DEPARTMENTS = [
  { id: "d-man", name: "Management" },
  { id: "d-ott", name: "Ottici" },
  { id: "d-add", name: "Addetti vendita" },
];
const person = (
  id: string,
  displayName: string,
  shortLabel: string,
  homeZone: SchedulePerson["homeZone"],
  dept: string,
  weeklyHours: number | null = 40,
  countsForCoverage = true,
): SchedulePerson => ({
  id,
  displayName,
  shortLabel,
  color: null,
  homeZone,
  weeklyHours,
  countsForCoverage,
  primaryDepartmentId: dept,
  departmentIds: [dept],
});
const PEOPLE: SchedulePerson[] = [
  person("p-sole", "Giulia", "GIU", "sole", "d-add"),
  person("p-paola", "Paola", "PAO", "vista", "d-man", 40, false),
  person("p-fra", "Francy", "FRA R", "vista", "d-ott"),
  person("p-jolly", "Marco", "MAR", "jolly", "d-add", 24),
];
let n = 0;
const shift = (
  profileId: string,
  date: string,
  start: string | null,
  end: string | null,
  extra: Partial<ShiftRecord> = {},
): ShiftRecord => ({
  id: `s${++n}`,
  profileId,
  date,
  templateId: null,
  start,
  end,
  breakMinutes: 0,
  departmentId: null,
  zone: null,
  isBackOffice: null,
  note: null,
  conflict: false,
  ...extra,
});
const TEMPLATES: TemplateRecord[] = [
  {
    id: "t-man",
    code: "MAN",
    label: "Manager",
    startTime: "10:00",
    endTime: "20:00",
    breakMinutes: 60,
    isAbsence: false,
  },
  {
    id: "t-r",
    code: "R",
    label: "Riposo",
    startTime: null,
    endTime: null,
    breakMinutes: 0,
    isAbsence: true,
  },
];
const MON = DAYS[0];
const SHIFTS: ShiftRecord[] = [
  // Francy: 10–14 e 15–19 (spezzato) = 8 ore.
  shift("p-fra", MON, "10:00", "14:00"),
  shift("p-fra", MON, "15:00", "19:00"),
  // Paola: back office 08:30–10:00 (predefinito del profilo), poi vendita 10:00–14:30.
  shift("p-paola", MON, "08:30", "10:00"),
  shift("p-paola", MON, "10:00", "14:30", { isBackOffice: false }),
  // Giulia: turno rapido MAN con un'ora di pausa = 9 ore.
  shift("p-sole", MON, "10:00", "20:00", { templateId: "t-man", breakMinutes: 60 }),
  // Marco (jolly) in Sole 12–16, poi riposo il martedì.
  shift("p-jolly", MON, "12:00", "16:00", { zone: "sole" }),
  shift("p-jolly", DAYS[1], null, null, { templateId: "t-r" }),
];
const LEAVES: LeaveRecord[] = [
  {
    profileId: "p-fra",
    date: DAYS[2],
    type: "ferie",
    hours: null,
    status: "confirmed",
    source: "planning",
  },
  {
    profileId: "p-sole",
    date: DAYS[3],
    type: "permesso",
    hours: null,
    status: "confirmed",
    source: "request",
  },
];
const CALENDAR = {
  openingHours: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((d) => [
      String(d),
      { open: d === 7 ? "10:30" : "10:00", close: "20:00" },
    ]),
  ),
  exceptions: {},
  holidays: [],
};

const timesheet = () =>
  buildTimesheetModel({
    days: DAYS,
    shifts: SHIFTS,
    leaves: LEAVES,
    people: PEOPLE,
    departments: DEPARTMENTS,
    calendar: CALENDAR,
  });
const grid = () =>
  buildAdminGridModel({
    days: DAYS,
    shifts: SHIFTS,
    leaves: LEAVES,
    people: PEOPLE,
    templates: TEMPLATES,
    departments: DEPARTMENTS,
    calendar: CALENDAR,
  });

/** Con EXPORT_OUT=<cartella> i file generati vengono salvati per controllarli a vista. */
function maybeSave(name: string, buf: Buffer) {
  if (process.env.EXPORT_OUT) writeFileSync(join(process.env.EXPORT_OUT, name), buf);
}

describe("modello del foglio orario", () => {
  it("colonne per area: Vista, poi Sole, poi Jolly, nell'ordine dell'array", () => {
    expect(timesheetGroups(PEOPLE).map((g) => [g.zone, g.people.map((p) => p.id)])).toEqual([
      ["vista", ["p-paola", "p-fra"]],
      ["sole", ["p-sole"]],
      ["jolly", ["p-jolly"]],
    ]);
    const m = timesheet();
    expect(m.weekNumber).toBe(43);
    expect(m.contractTotal).toBe(144);
    expect(m.columns.map((c) => c.shortLabel)).toEqual(["PAO", "FRA R", "GIU", "MAR"]);
  });

  it("celle 1 / 0,5, back office, ORARIO, TOT e indicatori del lunedì", () => {
    const mon = timesheet().days[0];
    const col = (id: string) => timesheet().columns.findIndex((c) => c.id === id);
    const at = (hour: number) => mon.cells[hour - 7];
    // Paola 08:30–10:00 in back office: 08 vale 0,5 (solo 08:30), 09 vale 1.
    expect(at(8)[col("p-paola")]).toEqual({ value: 0.5, marks: [null, "bo"] });
    expect(at(9)[col("p-paola")]).toEqual({ value: 1, marks: ["bo", "bo"] });
    expect(at(14)[col("p-paola")]).toEqual({ value: 0.5, marks: ["sale", null] });
    expect(at(14)[col("p-fra")].value).toBe(0);
    expect(mon.residual).toEqual([40, 40, 40, 24]);
    expect(timesheet().days[1].residual).toEqual([34, 32, 31, 20]);
    expect(mon.tot).toEqual([6, 8, 9, 4]);
    expect(mon.total).toBe(27);
    // 09:00: solo Paola in back office → TESTE 1, DELTA 0.
    expect(mon.indicators[2]).toMatchObject({ teste: 1, delta: 0, copOtt: false });
    // 12:00: Paola + Francy in Vista (Francy ottica), Giulia + Marco in Sole.
    expect(mon.indicators[5]).toMatchObject({
      teste: 4,
      delta: 4,
      vista: 2,
      sole: 2,
      copOtt: true,
    });
  });

  it("assenze a giornata intera: ferie (rosso) e richiesta approvata (verde)", () => {
    const m = timesheet();
    const fra = m.columns.findIndex((c) => c.id === "p-fra");
    const giu = m.columns.findIndex((c) => c.id === "p-sole");
    expect(m.days[2].leaves[fra]).toEqual({ fill: "ferie", label: "Ferie" });
    expect(m.days[3].leaves[giu]).toEqual({ fill: "request", label: "Permesso" });
    expect(m.days[0].leaves.every((l) => l === null)).toBe(true);
  });
});

describe("export Excel", () => {
  it("contiene la griglia Turni e il foglio Week con i valori attesi", async () => {
    const buf = await buildScheduleXlsx({ grid: grid(), timesheet: timesheet() });
    maybeSave("turni-week-43.xlsx", buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Turni", "Week 43"]);

    const turni = wb.getWorksheet("Turni")!;
    const rows: string[][] = [];
    const rowNumbers = new Map<string, number>();
    turni.eachRow((row, num) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)));
      rows.push(vals);
      rowNumbers.set(vals[0], num);
    });
    const find = (name: string) => rows.find((r) => r[0] === name)!;
    expect(rows[0][0]).toContain("Week 43");
    expect(rows.some((r) => r[0] === "MANAGEMENT")).toBe(true);
    expect(find("Francy").slice(1, 4)).toEqual(["10–14 · 15–19", "", "Ferie"]);
    expect(find("Giulia")[1]).toBe("MAN");
    expect(find("Giulia")[4]).toBe("Permesso");
    expect(find("Marco")[2]).toBe("R");
    expect(find("Francy")[8]).toBe("8 / 40");
    expect(find("Presenti").slice(1, 3)).toEqual(["4", "0"]);
    // La riga "Ore totali" è tutta numerica (anche "45,5" diventa 45.5).
    const oreRow = turni.getRow(rowNumbers.get("Ore totali")!);
    expect(oreRow.getCell(2).value).toBe(27);
    expect(typeof oreRow.getCell(3).value).toBe("number");
    // Le assenze sono in grigio.
    const fraRow = turni.getRow(rowNumbers.get("Francy")!);
    expect((fraRow.getCell(4).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFE7E5E4");

    const week = wb.getWorksheet("Week 43")!;
    expect(week.getCell(1, 1).value).toBe(43);
    expect(week.getCell(2, 3).value).toBe("PAO");
    expect(week.getCell(4, 2).value).toBe("ORARIO");
    // Lunedì: riga ORARIO = 4, ore dalle 07 alla riga 5; Paola (colonna C) alle 09 = 1 a righe.
    expect(week.getCell(4, 6).value).toBe(24);
    const paola09 = week.getCell(5 + 2, 3);
    expect(paola09.value).toBe(1);
    expect((paola09.fill as ExcelJS.FillPattern).pattern).toBe("darkUp");
    const fra10 = week.getCell(5 + 3, 4);
    expect(fra10.value).toBe(1);
    expect((fra10.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF0A0A0A");
    expect(week.getCell(5 + 7, 3).value).toBe(0.5); // Paola 14:00–14:30
    // Indicatori alle 12: COP. OTT. ✓, DELTA 4, TESTE 4, Vista 2, Sole 2.
    const ind = (c: number) => week.getCell(5 + 5, 7 + c).value;
    expect([ind(0), ind(1), ind(2), ind(3), ind(4)]).toEqual(["✓", 4, 4, 2, 2]);
    // TOT del lunedì (riga 20) e totale del negozio.
    expect(week.getCell(20, 2).value).toBe("TOT");
    expect(week.getCell(20, 4).value).toBe(8);
    expect(week.getCell(20, 7).value).toBe(27);
  });

  it("converte in numero le ore con la virgola nel piè di pagina", async () => {
    const g = grid();
    const ore = g.footer.find((f) => f.label === "Ore totali")!;
    ore.cells = ore.cells.map((v, i) => (i === 0 ? "45,5" : v));
    const buf = await buildScheduleXlsx({ grid: g, timesheet: timesheet() });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const turni = wb.getWorksheet("Turni")!;
    let value: unknown;
    turni.eachRow((row) => {
      if (row.getCell(1).value === "Ore totali") value = row.getCell(2).value;
    });
    expect(value).toBe(45.5);
  });
});

describe("export PDF", () => {
  const pages = (buf: Buffer) =>
    (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  it("layout week: un PDF valido di una sola pagina", async () => {
    const buf = await renderWeekPdf(timesheet());
    maybeSave("turni-week-43.pdf", buf);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pages(buf)).toBe(1);
  });

  it("griglia A4 orizzontale (versione di lavoro e pubblicata)", async () => {
    const buf = await renderGridPdf(grid(), "19/10/2026");
    maybeSave("turni-griglia-43.pdf", buf);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pages(buf)).toBe(1);

    const published: PublishedShift[] = [
      {
        id: "x",
        profile_id: "p-fra",
        date: MON,
        start_time: "10:00",
        end_time: "19:00",
        break_minutes: 60,
        template_code: null,
        template_label: null,
        is_absence: false,
        zone: "vista",
        is_back_office: false,
        department_id: "d-ott",
        note: null,
        changed: false,
      },
    ];
    const pub = buildPublishedGridModel({
      days: DAYS,
      shifts: published,
      leaves: [{ profileId: "p-sole", date: DAYS[3], kind: "assente", status: "confirmed" }],
      people: PEOPLE,
      departments: DEPARTMENTS,
    });
    const cells = pub.groups.flatMap((g) => g.rows).find((r) => r.id === "p-sole")!.cells;
    expect(cells[3]).toEqual({ text: "Assente", tone: "absence" });
    const out = await renderGridPdf(pub, "19/10/2026");
    maybeSave("turni-pubblicati-43.pdf", out);
    expect(out.subarray(0, 4).toString()).toBe("%PDF");
  });
});
