/**
 * Export Excel dei turni (§8.1) con exceljs. Puro rispetto ai dati: riceve i modelli già costruiti.
 *
 * - Foglio "Turni": persone × giorni raggruppate per reparto, assenze in grigio, ore per persona,
 *   righe di riepilogo (presenti, ore).
 * - Foglio "Week NN": il layout del foglio orario (blocchi per giorno, colonne persone per area,
 *   celle 1 / 0,5 con riempimento nero o a righe, righe ORARIO e TOT, indicatori a destra).
 */
import ExcelJS from "exceljs";
import type { SlotMark } from "@/lib/shifts/slots";
import type { ScheduleGridModel } from "./schedule-grid";
import {
  isSlotOutsideOpening,
  TIMESHEET_HOURS,
  type LeaveFill,
  type TimesheetModel,
} from "./timesheet-model";

const BLACK = "FF0A0A0A";
const WHITE = "FFFFFFFF";
const GREY_FILL = "FFE7E5E4";
const SURFACE = "FFF5F5F4";
const LINE = "FFD6D3D1";
const MUTED = "FF57534E";
const DANGER = "FFB42318";
/** Tinte tenui (~12%) delle aree su bianco. */
const VISTA_TINT = "FFDDE2E8";
const SOLE_TINT = "FFF4ECE2";
const LEAVE_FILL: Record<LeaveFill, string> = {
  ferie: "FFF6DEDC",
  request: "FFDAEDE3",
  pending: "FFEFF7F2",
  other: GREY_FILL,
};

const solid = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});
const thin: ExcelJS.Border = { style: "thin", color: { argb: LINE } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function zoneTint(zone: string) {
  return zone === "vista" ? VISTA_TINT : zone === "sole" ? SOLE_TINT : SURFACE;
}

/** Numero all'italiana per le celle di testo (le celle numeriche restano numeri). */
const it = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function addGridSheet(wb: ExcelJS.Workbook, grid: ScheduleGridModel) {
  const ws = wb.addWorksheet("Turni", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
  });
  const lastCol = 1 + grid.days.length + (grid.showHours ? 1 : 0);
  ws.getColumn(1).width = 24;
  for (let c = 2; c <= 1 + grid.days.length; c++) ws.getColumn(c).width = 16;
  if (grid.showHours) ws.getColumn(lastCol).width = 12;

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `${grid.title} · ${grid.subtitle}`;
  title.font = { bold: true, size: 14 };

  const header = ws.getRow(3);
  header.getCell(1).value = "Persona";
  grid.days.forEach((d, i) => {
    header.getCell(2 + i).value = `${d.label} ${d.sublabel}`;
  });
  if (grid.showHours) header.getCell(lastCol).value = "Ore / contratto";
  header.eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: MUTED } };
    cell.border = { bottom: { style: "thin", color: { argb: BLACK } } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  header.getCell(1).alignment = { horizontal: "left" };

  let r = 4;
  for (const group of grid.groups) {
    ws.mergeCells(r, 1, r, lastCol);
    const g = ws.getCell(r, 1);
    g.value = group.label.toUpperCase();
    g.font = { bold: true, size: 9, color: { argb: MUTED } };
    g.fill = solid(SURFACE);
    r++;
    for (const row of group.rows) {
      const xr = ws.getRow(r);
      xr.getCell(1).value = row.name;
      row.cells.forEach((cell, i) => {
        const xc = xr.getCell(2 + i);
        xc.value = cell.text;
        xc.alignment = { horizontal: "center" };
        xc.border = box;
        if (cell.tone === "absence") {
          xc.fill = solid(GREY_FILL);
          xc.font = { color: { argb: MUTED }, italic: true };
        } else if (cell.tone === "closed") {
          xc.fill = solid(SURFACE);
        }
      });
      if (grid.showHours && row.hours) {
        const h = xr.getCell(lastCol);
        h.value = row.hours;
        h.alignment = { horizontal: "right" };
      }
      r++;
    }
  }
  for (const f of grid.footer) {
    const xr = ws.getRow(r);
    xr.getCell(1).value = f.label;
    xr.getCell(1).font = { bold: true };
    f.cells.forEach((v, i) => {
      const xc = xr.getCell(2 + i);
      // Conteggi e ore ("45,5") come numeri, così la riga non mescola testi e numeri.
      xc.value = /^\d+(,\d+)?$/.test(v) ? Number(v.replace(",", ".")) : v;
      xc.alignment = { horizontal: "center" };
      xc.font = { bold: true };
    });
    xr.eachCell((c) => {
      c.border = { top: { style: "thin", color: { argb: BLACK } } };
    });
    r++;
  }
  return ws;
}

/** Colonne del foglio "Week": A data, B ora, poi persone, poi 5 indicatori. */
const INDICATORS = ["COP. OTT.", "DELTA", "TESTE", "Vista", "Sole"] as const;

function paintHourCell(cell: ExcelJS.Cell, value: 0 | 0.5 | 1, marks: [SlotMark, SlotMark]) {
  if (value === 0) return;
  const bo = marks.every((m) => m !== "sale");
  cell.value = value;
  cell.numFmt = "0.#";
  if (bo) {
    // Back office: righe diagonali al posto del pieno.
    cell.fill = {
      type: "pattern",
      pattern: value === 1 ? "darkUp" : "lightUp",
      fgColor: { argb: BLACK },
      bgColor: { argb: WHITE },
    };
    cell.font = { size: 8, bold: true, color: { argb: BLACK } };
  } else if (value === 1) {
    cell.fill = solid(BLACK);
    cell.font = { size: 8, color: { argb: WHITE } };
  } else {
    // Mezz'ora: in Excel non si riempie mezza cella, quindi pieno grigio scuro con 0,5.
    cell.fill = solid(MUTED);
    cell.font = { size: 8, color: { argb: WHITE } };
  }
}

function addWeekSheet(wb: ExcelJS.Workbook, model: TimesheetModel) {
  const ws = wb.addWorksheet(`Week ${model.weekNumber}`, {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 },
    },
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
  });
  const nPeople = model.columns.length;
  const firstPerson = 3;
  const firstInd = firstPerson + nPeople;
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 8;
  for (let i = 0; i < nPeople; i++) ws.getColumn(firstPerson + i).width = 6;
  for (let i = 0; i < INDICATORS.length; i++) ws.getColumn(firstInd + i).width = 7;

  // Riga 1: numero settimana e aree.
  const r1 = ws.getRow(1);
  ws.mergeCells(1, 1, 1, 2);
  r1.getCell(1).value = model.weekNumber;
  r1.getCell(1).font = { bold: true, size: 16 };
  r1.getCell(1).alignment = { horizontal: "center" };
  let c = firstPerson;
  for (const g of model.groups) {
    if (g.span > 1) ws.mergeCells(1, c, 1, c + g.span - 1);
    const cell = r1.getCell(c);
    cell.value = g.label.toUpperCase();
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center" };
    for (let k = 0; k < g.span; k++) r1.getCell(c + k).fill = solid(zoneTint(g.zone));
    c += g.span;
  }
  ws.mergeCells(1, firstInd, 1, firstInd + INDICATORS.length - 1);
  r1.getCell(firstInd).value = `Contratto: ${it(model.contractTotal)} h`;
  r1.getCell(firstInd).font = { bold: true, size: 8 };
  r1.getCell(firstInd).alignment = { horizontal: "center" };

  // Riga 2: sigle; riga 3: ore di contratto.
  const r2 = ws.getRow(2);
  const r3 = ws.getRow(3);
  r2.getCell(2).value = "ORA";
  r3.getCell(2).value = "CONTR.";
  model.columns.forEach((col, i) => {
    const a = r2.getCell(firstPerson + i);
    a.value = col.shortLabel;
    a.fill = solid(zoneTint(col.zone));
    a.font = { bold: true, size: 7 };
    a.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    a.border = box;
    const b = r3.getCell(firstPerson + i);
    b.value = model.contract[i] ?? "";
    b.font = { size: 7, color: { argb: MUTED } };
    b.alignment = { horizontal: "center" };
  });
  INDICATORS.forEach((label, i) => {
    const cell = r2.getCell(firstInd + i);
    cell.value = label;
    cell.font = { bold: true, size: 7 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = box;
    if (label === "Vista") cell.fill = solid(VISTA_TINT);
    if (label === "Sole") cell.fill = solid(SOLE_TINT);
  });
  r2.height = 22;
  for (const cell of [r2.getCell(2), r3.getCell(2)]) cell.font = { bold: true, size: 7 };

  let r = 4;
  for (const day of model.days) {
    const top = r;
    // ORARIO: ore residue prima del giorno.
    const orario = ws.getRow(r);
    orario.getCell(2).value = "ORARIO";
    orario.getCell(2).font = { bold: true, size: 7 };
    day.residual.forEach((v, i) => {
      const cell = orario.getCell(firstPerson + i);
      cell.value = v ?? "";
      cell.alignment = { horizontal: "center" };
      cell.font = {
        size: 7,
        bold: true,
        color: { argb: v !== null && v < 0 ? DANGER : v === 0 ? MUTED : BLACK },
      };
      cell.border = { bottom: { style: "thin", color: { argb: BLACK } } };
    });
    r++;

    TIMESHEET_HOURS.forEach((hour, h) => {
      const row = ws.getRow(r);
      row.height = 12;
      const label = row.getCell(2);
      label.value = `${String(hour).padStart(2, "0")}-${String(hour + 1).padStart(2, "0")}`;
      label.font = { size: 7, color: { argb: MUTED } };
      const outside =
        isSlotOutsideOpening(h * 2, day.opening) && isSlotOutsideOpening(h * 2 + 1, day.opening);
      day.cells[h].forEach((cell, i) => {
        const xc = row.getCell(firstPerson + i);
        xc.border = box;
        const leave = day.leaves[i];
        if (leave) {
          xc.fill = solid(LEAVE_FILL[leave.fill]);
          if (h === 0) {
            xc.value = leave.label;
            xc.font = { size: 6, color: { argb: MUTED } };
          }
          return;
        }
        if (outside) xc.fill = solid(SURFACE);
        paintHourCell(xc, cell.value, cell.marks);
        xc.alignment = { horizontal: "center", vertical: "middle" };
      });
      const ind = day.indicators[h];
      const values: (string | number)[] = [
        ind.copOtt ? "✓" : "✗",
        ind.delta,
        ind.teste,
        ind.vista,
        ind.sole,
      ];
      values.forEach((v, i) => {
        const xc = row.getCell(firstInd + i);
        xc.value = v;
        xc.font = { size: 7, color: { argb: i === 0 && !ind.copOtt ? DANGER : BLACK } };
        xc.alignment = { horizontal: "center" };
        xc.border = box;
        if (outside) xc.fill = solid(SURFACE);
      });
      r++;
    });

    // TOT: ore del giorno per persona + totale del negozio.
    const tot = ws.getRow(r);
    tot.getCell(2).value = "TOT";
    tot.getCell(2).font = { bold: true, size: 7 };
    day.tot.forEach((v, i) => {
      const cell = tot.getCell(firstPerson + i);
      cell.value = v || "";
      cell.font = { bold: true, size: 7 };
      cell.alignment = { horizontal: "center" };
      cell.border = { top: { style: "thin", color: { argb: BLACK } } };
    });
    ws.mergeCells(r, firstInd, r, firstInd + INDICATORS.length - 1);
    const total = tot.getCell(firstInd);
    total.value = day.total;
    total.font = { bold: true, size: 8 };
    total.alignment = { horizontal: "center" };

    // Data in verticale a sinistra del blocco.
    ws.mergeCells(top, 1, r, 1);
    const dateCell = ws.getCell(top, 1);
    dateCell.value = `${day.label.toUpperCase()}${day.holidayLabel ? ` · ${day.holidayLabel}` : ""}${day.closed ? " · CHIUSO" : ""}`;
    dateCell.alignment = { textRotation: 90, horizontal: "center", vertical: "middle" };
    dateCell.font = { bold: true, size: 8, color: { argb: day.closed ? MUTED : BLACK } };
    dateCell.border = { right: { style: "thin", color: { argb: BLACK } } };
    r += 2; // una riga vuota tra i blocchi
  }
  return ws;
}

/** Costruisce il file xlsx e restituisce il buffer. */
export async function buildScheduleXlsx(input: {
  grid: ScheduleGridModel;
  timesheet: TimesheetModel;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portale Staff Cordusio";
  wb.created = new Date();
  addGridSheet(wb, input.grid);
  addWeekSheet(wb, input.timesheet);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
