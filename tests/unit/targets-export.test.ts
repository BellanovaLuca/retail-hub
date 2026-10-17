import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildTargetsExportModel } from "@/lib/export/targets-model";
import { buildTargetsXlsx } from "@/lib/export/targets-xlsx";

const vistaKpis = [
  { kpiId: "k-wo", code: "WO", label: "N. WO" },
  { kpiId: "k-ps", code: "PZ_SOLE", label: "Pz sole x ADV" },
];

const model = buildTargetsExportModel({
  weekStart: "2026-10-19",
  people: [
    { profileId: "sara", name: "Sara P.", zone: "vista", kpis: vistaKpis },
    { profileId: "fra", name: "Francy", zone: "jolly", kpis: vistaKpis },
    {
      profileId: "giu",
      name: "Giulia",
      zone: "sole",
      kpis: [{ kpiId: "k-ps", code: "PZ_SOLE", label: "Pz sole" }],
    },
  ],
  entries: [
    { profileId: "sara", kpiId: "k-wo", date: "2026-10-19", value: 3 },
    { profileId: "sara", kpiId: "k-wo", date: "2026-10-21", value: 2 },
    { profileId: "sara", kpiId: "k-ps", date: "2026-10-21", value: 1 },
    { profileId: "giu", kpiId: "k-ps", date: "2026-10-25", value: 4 },
  ],
  targets: { sara: { "k-wo": 12, "k-ps": 1 }, giu: { "k-ps": 37 } },
  comments: { sara: { "k-wo": "No demo no party", general: "Ottima settimana" } },
  notes: { sara: "Grazie!" },
});

describe("buildTargetsExportModel", () => {
  it("un foglio per gruppo: Vista (con i jolly) e Sole", () => {
    expect(model.title).toBe("Obiettivi individuali · Week 43");
    expect(model.sheets.map((s) => s.name)).toEqual(["Vista", "Sole"]);
    expect(model.sheets[0].blocks.map((b) => b.name)).toEqual(["Sara P.", "Francy"]);
    expect(model.sheets[1].blocks.map((b) => b.name)).toEqual(["Giulia"]);
    expect(model.dayHeaders[0]).toBe("Lun 19/10");
  });

  it("blocco voci × lun–dom con A quanto sei, Quanto mi manca, Obiettivo, Commento", () => {
    const sara = model.sheets[0].blocks[0];
    expect(sara.rows[0]).toEqual({
      label: "N. WO",
      days: [3, null, 2, null, null, null, null],
      done: 5,
      remaining: 7,
      target: 12,
      comment: "No demo no party",
    });
    expect(sara.rows[1]).toMatchObject({ done: 1, remaining: 0, target: 1 });
    expect(sara.generalComment).toBe("Ottima settimana");
    expect(sara.note).toBe("Grazie!");
    expect(model.sheets[1].blocks[0].rows[0].days[6]).toBe(4);
  });
});

describe("buildTargetsXlsx", () => {
  it("scrive i fogli e i blocchi delle persone", async () => {
    const buffer = await buildTargetsXlsx(model);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Vista", "Sole"]);
    const ws = wb.getWorksheet("Vista")!;
    expect(ws.getCell(3, 1).value).toBe("SARA P.");
    expect(ws.getCell(3, 9).value).toBe("A quanto sei");
    expect(ws.getCell(3, 12).value).toBe("Commento week");
    expect(ws.getCell(4, 1).value).toBe("N. WO");
    expect(ws.getCell(4, 2).value).toBe(3);
    expect(ws.getCell(4, 9).value).toBe(5);
    expect(ws.getCell(4, 10).value).toBe(7);
    expect(ws.getCell(4, 11).value).toBe(12);
    expect(ws.getCell(4, 12).value).toBe("No demo no party");
    expect(ws.getCell(5, 10).value).toBe("Raggiunto ✓");
  });
});
