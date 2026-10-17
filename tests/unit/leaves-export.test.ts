import { describe, expect, it } from "vitest";
import {
  exportCellCode,
  exportChip,
  fitNames,
  namesByDate,
  type LeavesExportData,
} from "@/lib/export/leaves-data";

const data: LeavesExportData = {
  year: 2026,
  title: "Planning ferie 2026",
  subtitle: "",
  audience: "admin",
  people: [
    { id: "a", displayName: "Marta", departmentName: "Management" },
    { id: "b", displayName: "Luca", departmentName: "Ottici" },
  ],
  leaves: [
    { profileId: "b", date: "2026-08-10", type: "ferie", hours: null, status: "tentative" },
    { profileId: "a", date: "2026-08-10", type: "permesso", hours: 4, status: "confirmed" },
    { profileId: "z", date: "2026-08-10", type: "ferie", hours: null, status: "confirmed" },
  ],
  holidays: new Map(),
};

describe("export ferie", () => {
  it("nomi per giorno nell'ordine del foglio, solo persone note", () => {
    expect(namesByDate(data).get("2026-08-10")).toEqual(["Marta (PE4)", "Luca?"]);
  });

  it("nel planning pubblico non compare il motivo", () => {
    const pub = { ...data, audience: "public" as const };
    expect(namesByDate(pub).get("2026-08-10")).toEqual(["Marta (assente)", "Luca?"]);
    expect(
      exportCellCode(
        { profileId: "a", date: "x", type: "malattia", hours: null, status: "confirmed" },
        "public",
      ),
    ).toBe("A");
    expect(
      exportChip(
        { profileId: "a", date: "x", type: "assente", hours: null, status: "confirmed" },
        "Marta",
        "admin",
      ),
    ).toBe("Marta (assente)");
  });

  it("codici delle celle per l'admin", () => {
    expect(
      exportCellCode(
        { profileId: "a", date: "x", type: "permesso", hours: 4.5, status: "tentative" },
        "admin",
      ),
    ).toBe("PE4,5?");
  });

  it("accorcia l'elenco con +N", () => {
    expect(fitNames(["Marta", "Luca"], 40)).toBe("Marta, Luca");
    expect(fitNames(["Marta", "Luca", "Giulia", "Paolo"], 14)).toBe("Marta, Luca +2");
    expect(fitNames(["Francesca"], 4)).toBe("+1");
  });
});
