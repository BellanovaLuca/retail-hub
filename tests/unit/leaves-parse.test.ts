import { describe, expect, it } from "vitest";
import { formatLeaveCell, leaveLabel, leaveLabelPublic, parseLeaveCell } from "@/lib/leaves/parse";

describe("parseLeaveCell", () => {
  it("cella vuota", () => {
    expect(parseLeaveCell("  ")).toEqual({ kind: "empty" });
  });

  it("X svuota la cella, come negli Excel del negozio", () => {
    expect(parseLeaveCell("X")).toEqual({ kind: "empty" });
    expect(parseLeaveCell("x")).toEqual({ kind: "empty" });
    expect(parseLeaveCell(" x ")).toEqual({ kind: "empty" });
    expect(parseLeaveCell("XX")).toMatchObject({ kind: "error" });
  });

  it("ore del permesso fino a 12", () => {
    expect(parseLeaveCell("PE12")).toEqual({
      kind: "leave",
      type: "permesso",
      status: "confirmed",
      hours: 12,
    });
    expect(parseLeaveCell("PE12,5")).toMatchObject({
      kind: "error",
      message: expect.stringMatching(/da 0,5 a 12/),
    });
  });

  it.each([
    ["F", "ferie", "confirmed", null],
    ["f", "ferie", "confirmed", null],
    ["F?", "ferie", "tentative", null],
    ["f ?", "ferie", "tentative", null],
    ["PE", "permesso", "confirmed", null],
    ["PE4", "permesso", "confirmed", 4],
    ["pe 4", "permesso", "confirmed", 4],
    ["PE4,5", "permesso", "confirmed", 4.5],
    ["PE4.5?", "permesso", "tentative", 4.5],
    ["MA", "malattia", "confirmed", null],
    ["ma", "malattia", "confirmed", null],
    ["A", "altro", "confirmed", null],
    ["AL", "altro", "confirmed", null],
  ])("%s", (text, type, status, hours) => {
    expect(parseLeaveCell(text)).toEqual({ kind: "leave", type, status, hours });
  });

  it("errori in italiano", () => {
    expect(parseLeaveCell("Z")).toMatchObject({
      kind: "error",
      message: expect.stringMatching(/non è un codice valido/),
    });
    expect(parseLeaveCell("F4")).toMatchObject({
      kind: "error",
      message: expect.stringMatching(/solo sul permesso/),
    });
    expect(parseLeaveCell("PE0")).toMatchObject({ kind: "error" });
    expect(parseLeaveCell("PE13")).toMatchObject({ kind: "error" });
    expect(parseLeaveCell("PE4,3")).toMatchObject({ kind: "error" });
  });
});

describe("formatLeaveCell", () => {
  it("inverso del parser", () => {
    expect(formatLeaveCell({ type: "ferie", status: "confirmed", hours: null })).toBe("F");
    expect(formatLeaveCell({ type: "ferie", status: "tentative", hours: null })).toBe("F?");
    expect(formatLeaveCell({ type: "permesso", status: "confirmed", hours: 4.5 })).toBe("PE4,5");
    expect(formatLeaveCell({ type: "malattia", status: "confirmed", hours: null })).toBe("MA");
    expect(formatLeaveCell({ type: "altro", status: "confirmed", hours: null })).toBe("A");
    for (const code of ["F", "F?", "PE", "PE4", "PE4,5?", "MA", "A"]) {
      const parsed = parseLeaveCell(code);
      if (parsed.kind !== "leave") throw new Error(code);
      expect(formatLeaveCell(parsed)).toBe(code);
    }
  });
});

describe("etichette", () => {
  it("privacy: ai colleghi solo 'Ferie' o 'Assente'", () => {
    expect(leaveLabelPublic("ferie")).toBe("Ferie");
    expect(leaveLabelPublic("malattia")).toBe("Assente");
    expect(leaveLabelPublic("permesso")).toBe("Assente");
    expect(leaveLabelPublic("altro")).toBe("Assente");
    expect(leaveLabel("malattia")).toBe("Malattia");
  });
});
