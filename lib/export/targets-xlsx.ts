/**
 * Export Excel degli obiettivi individuali (exceljs). Puro rispetto ai dati: riceve il modello.
 * Layout per foglio: titolo, poi per ogni persona un blocco con intestazione (nome), una riga
 * per voce (lun–dom, A quanto sei, Quanto mi manca?, Obiettivo, Commento week), il commento
 * generale della settimana e la nota del dipendente.
 */
import ExcelJS from "exceljs";
import { EXPORT_COLUMNS, type TargetsExportModel } from "./targets-model";

const BLACK = "FF0A0A0A";
const WHITE = "FFFFFFFF";
const SURFACE = "FFF5F5F4";
const LINE = "FFD6D3D1";
const MUTED = "FF57534E";
const SUCCESS = "FF067647";
const VISTA_TINT = "FFDDE2E8";
const SOLE_TINT = "FFF4ECE2";

const solid = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});
const thin: ExcelJS.Border = { style: "thin", color: { argb: LINE } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

export async function buildTargetsXlsx(model: TargetsExportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portale Staff Cordusio";
  wb.created = new Date();

  const dayCount = model.dayHeaders.length;
  const colDone = 2 + dayCount;
  const colRemaining = colDone + 1;
  const colTarget = colDone + 2;
  const colComment = colDone + 3;

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name, {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
      views: [{ state: "frozen", xSplit: 1, ySplit: 2 }],
    });
    ws.getColumn(1).width = 22;
    for (let c = 2; c < colDone; c++) ws.getColumn(c).width = 9;
    ws.getColumn(colDone).width = 12;
    ws.getColumn(colRemaining).width = 15;
    ws.getColumn(colTarget).width = 11;
    ws.getColumn(colComment).width = 48;

    ws.mergeCells(1, 1, 1, colComment);
    const title = ws.getCell(1, 1);
    title.value = `${model.title} · ${sheet.name}`;
    title.font = { bold: true, size: 14 };

    let r = 3;
    if (sheet.blocks.length === 0) {
      ws.getCell(r, 1).value = "Nessuna persona in questo gruppo.";
      ws.getCell(r, 1).font = { italic: true, color: { argb: MUTED } };
    }
    for (const block of sheet.blocks) {
      // Intestazione del blocco: nome della persona + colonne.
      const header = ws.getRow(r);
      header.getCell(1).value = block.name.toUpperCase();
      model.dayHeaders.forEach((d, i) => (header.getCell(2 + i).value = d));
      EXPORT_COLUMNS.forEach((c, i) => (header.getCell(colDone + i).value = c));
      for (let c = 1; c <= colComment; c++) {
        const cell = header.getCell(c);
        cell.font = { bold: true, size: 9, color: { argb: c === 1 ? WHITE : BLACK } };
        cell.fill = solid(c === 1 ? BLACK : sheet.zone === "vista" ? VISTA_TINT : SOLE_TINT);
        cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center" };
        cell.border = box;
      }
      header.height = 20;
      r++;

      for (const row of block.rows) {
        const line = ws.getRow(r);
        line.getCell(1).value = row.label;
        row.days.forEach((v, i) => (line.getCell(2 + i).value = v));
        line.getCell(colDone).value = row.done;
        line.getCell(colRemaining).value =
          row.target === null ? null : row.remaining === 0 ? "Raggiunto ✓" : row.remaining;
        line.getCell(colTarget).value = row.target;
        line.getCell(colComment).value = row.comment || null;
        for (let c = 1; c <= colComment; c++) {
          const cell = line.getCell(c);
          cell.border = box;
          cell.font = { size: 10 };
          cell.alignment = {
            vertical: "middle",
            horizontal: c === 1 || c === colComment ? "left" : "center",
            wrapText: c === colComment,
          };
        }
        line.getCell(colDone).font = { size: 10, bold: true };
        line.getCell(colDone).fill = solid(SURFACE);
        if (row.target !== null && row.remaining === 0) {
          line.getCell(colRemaining).font = { size: 10, color: { argb: SUCCESS } };
        }
        r++;
      }

      if (block.generalComment) {
        ws.mergeCells(r, 2, r, colComment);
        ws.getCell(r, 1).value = "Commento week";
        ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: MUTED } };
        ws.getCell(r, 2).value = block.generalComment;
        ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
        r++;
      }
      if (block.note) {
        ws.mergeCells(r, 2, r, colComment);
        ws.getCell(r, 1).value = "Nota del dipendente";
        ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: MUTED } };
        ws.getCell(r, 2).value = block.note;
        ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
        r++;
      }
      r++; // riga vuota tra i blocchi
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
