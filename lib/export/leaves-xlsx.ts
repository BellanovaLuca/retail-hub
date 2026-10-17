import "server-only";
import ExcelJS from "exceljs";
import {
  countOnLeaveByDay,
  MONTH_NAMES,
  isWeekendDate,
  monthDates,
  weekdayLetter,
  yearDates,
} from "@/lib/leaves/plan";
import { exportCellCode, namesByDate, type LeavesExportData } from "./leaves-data";

const BLACK = "FF0A0A0A";
const GREY = "FF57534E";
const LINE = "FFE7E5E4";
const SHADE = "FFF5F5F4";
const AMBER = "FFB54708";

const thin = { style: "thin" as const, color: { argb: LINE } };
const shade: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: SHADE } };

/**
 * Excel del planning ferie: foglio "Calendario" nello stesso layout a 12 mesi dell'Excel attuale
 * (4 mesi per fascia, una riga per giorno con i nomi), più il foglio "Persone × giorni".
 */
export async function buildLeavesXlsx(data: LeavesExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portale Staff Cordusio";
  wb.created = new Date();

  calendarSheet(wb, data);
  gridSheet(wb, data);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function calendarSheet(wb: ExcelJS.Workbook, data: LeavesExportData) {
  const ws = wb.addWorksheet("Calendario", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  const names = namesByDate(data);

  // 4 blocchi per fascia: giorno, lettera, persone + una colonna di spazio.
  const BLOCK = 4;
  for (let b = 0; b < 4; b++) {
    ws.getColumn(b * BLOCK + 1).width = 4;
    ws.getColumn(b * BLOCK + 2).width = 3;
    ws.getColumn(b * BLOCK + 3).width = 34;
    ws.getColumn(b * BLOCK + 4).width = 2;
  }

  ws.getCell(1, 1).value = data.title;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: BLACK } };
  ws.getCell(2, 1).value = data.subtitle;
  ws.getCell(2, 1).font = { size: 9, color: { argb: GREY } };

  const BAND_ROWS = 33; // intestazione + 31 giorni + spazio
  for (let m = 0; m < 12; m++) {
    const band = Math.floor(m / 4);
    const col = (m % 4) * BLOCK + 1;
    const top = 4 + band * BAND_ROWS;

    ws.mergeCells(top, col, top, col + 2);
    const head = ws.getCell(top, col);
    head.value = MONTH_NAMES[m].toUpperCase();
    head.font = { bold: true, size: 10, color: { argb: BLACK } };
    head.border = { bottom: { style: "medium", color: { argb: BLACK } } };

    monthDates(data.year, m + 1).forEach((date, i) => {
      const r = top + 1 + i;
      const shaded = isWeekendDate(date) || data.holidays.has(date);
      const cells = [ws.getCell(r, col), ws.getCell(r, col + 1), ws.getCell(r, col + 2)];
      cells[0].value = i + 1;
      cells[0].alignment = { horizontal: "right" };
      cells[1].value = weekdayLetter(date);
      cells[1].alignment = { horizontal: "center" };
      cells[2].value = (names.get(date) ?? []).join(", ");
      cells[2].alignment = { wrapText: true, vertical: "top" };
      const holiday = data.holidays.get(date);
      if (holiday) cells[2].note = holiday;
      for (const c of cells) {
        c.font = { size: 9, color: { argb: c === cells[2] ? BLACK : GREY } };
        c.border = { bottom: thin };
        if (shaded) c.fill = shade;
      }
    });
  }

  const legendRow = 4 + 3 * BAND_ROWS;
  ws.getCell(legendRow, 1).value =
    data.audience === "admin"
      ? "? = da confermare · (PE) permesso, (PE4) permesso di 4 ore, (MA) malattia, (A) altra assenza · in grigio weekend e festivi"
      : "? = da confermare · in grigio weekend e festivi";
  ws.getCell(legendRow, 1).font = { size: 8, color: { argb: GREY } };
}

function gridSheet(wb: ExcelJS.Workbook, data: LeavesExportData) {
  const ws = wb.addWorksheet("Persone × giorni", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToHeight: 1 },
  });
  const dates = yearDates(data.year);
  const byCell = new Map(data.leaves.map((l) => [`${l.profileId}|${l.date}`, l]));

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 16;
  dates.forEach((_, i) => (ws.getColumn(3 + i).width = 4.5));

  ws.getCell(1, 1).value = data.title;
  ws.getCell(1, 1).font = { bold: true };
  ws.getCell(2, 1).value = "Persona";
  ws.getCell(2, 2).value = "Reparto";
  dates.forEach((date, i) => {
    const day = Number(date.slice(8));
    if (day === 1) {
      const head = ws.getCell(1, 3 + i);
      head.value = MONTH_NAMES[Number(date.slice(5, 7)) - 1];
      head.font = { bold: true, size: 9 };
    }
    const c = ws.getCell(2, 3 + i);
    c.value = `${day} ${weekdayLetter(date)}`;
    c.alignment = { horizontal: "center", textRotation: 90 };
    c.font = { size: 8, color: { argb: GREY } };
    if (isWeekendDate(date) || data.holidays.has(date)) c.fill = shade;
  });
  ws.getRow(2).height = 34;
  for (const c of [ws.getCell(2, 1), ws.getCell(2, 2)]) {
    c.font = { bold: true, size: 9 };
    c.border = { bottom: { style: "thin", color: { argb: BLACK } } };
  }

  data.people.forEach((p, r) => {
    const row = 3 + r;
    ws.getCell(row, 1).value = p.displayName;
    ws.getCell(row, 2).value = p.departmentName ?? "";
    ws.getCell(row, 2).font = { size: 9, color: { argb: GREY } };
    dates.forEach((date, i) => {
      const leave = byCell.get(`${p.id}|${date}`);
      const c = ws.getCell(row, 3 + i);
      if (isWeekendDate(date) || data.holidays.has(date)) c.fill = shade;
      c.border = { right: thin, bottom: thin };
      if (!leave) return;
      c.value = exportCellCode(leave, data.audience);
      c.alignment = { horizontal: "center" };
      c.font = { size: 8, bold: leave.type === "ferie" };
      if (leave.status === "tentative") {
        const dashed = { style: "dashed" as const, color: { argb: AMBER } };
        c.border = { top: dashed, left: dashed, right: dashed, bottom: dashed };
      }
    });
  });

  // Riepilogo: persone in ferie per giorno.
  const counts = countOnLeaveByDay(data.leaves, () => null);
  const total = 3 + data.people.length;
  ws.getCell(total, 1).value = "In ferie";
  ws.getCell(total, 1).font = { bold: true, size: 9 };
  dates.forEach((date, i) => {
    const n = counts.get(date)?.total ?? 0;
    const c = ws.getCell(total, 3 + i);
    if (n) c.value = n;
    c.alignment = { horizontal: "center" };
    c.font = { size: 8, color: { argb: GREY } };
    c.border = { top: { style: "thin", color: { argb: BLACK } } };
  });
}
