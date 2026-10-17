import { describe, expect, it } from "vitest";
import {
  formatShiftCompact,
  formatShiftLong,
  parseShiftCell,
  type ShiftTemplateRef,
} from "@/lib/shifts/parse";

const templates: ShiftTemplateRef[] = [
  { code: "MAN", startTime: "10:00", endTime: "20:00", breakMinutes: 60, isAbsence: false },
  { code: "R", startTime: null, endTime: null, breakMinutes: 0, isAbsence: true },
  { code: "F", startTime: null, endTime: null, breakMinutes: 0, isAbsence: true },
  { code: "PE", startTime: null, endTime: null, breakMinutes: 0, isAbsence: true },
];

const times = (text: string) => {
  const r = parseShiftCell(text, templates);
  if (r.kind !== "times") throw new Error(`atteso un orario, ottenuto ${JSON.stringify(r)}`);
  return r.segments;
};

const errorOf = (text: string) => {
  const r = parseShiftCell(text, templates);
  if (r.kind !== "error") throw new Error(`atteso un errore, ottenuto ${JSON.stringify(r)}`);
  return r.message;
};

describe("parseShiftCell", () => {
  it("cella vuota", () => {
    expect(parseShiftCell("", templates)).toEqual({ kind: "empty" });
    expect(parseShiftCell("   ", templates)).toEqual({ kind: "empty" });
  });

  it("codici turno rapido senza distinzione di maiuscole", () => {
    expect(parseShiftCell("man", templates)).toEqual({ kind: "template", code: "MAN" });
    expect(parseShiftCell(" R ", templates)).toEqual({ kind: "template", code: "R" });
    expect(parseShiftCell("f", templates)).toEqual({ kind: "template", code: "F" });
    expect(parseShiftCell("Pe", templates)).toEqual({ kind: "template", code: "PE" });
  });

  it.each([
    ["10-14", [{ start: "10:00", end: "14:00" }]],
    ["10:30-20", [{ start: "10:30", end: "20:00" }]],
    ["10.30-20", [{ start: "10:30", end: "20:00" }]],
    ["10,30-20", [{ start: "10:30", end: "20:00" }]],
    ["1030-2000", [{ start: "10:30", end: "20:00" }]],
    ["930-13", [{ start: "09:30", end: "13:00" }]],
    ["10–20", [{ start: "10:00", end: "20:00" }]],
    ["10 - 14", [{ start: "10:00", end: "14:00" }]],
    ["8:30-10", [{ start: "08:30", end: "10:00" }]],
    ["10:15-18:45", [{ start: "10:15", end: "18:45" }]],
    ["0-24", [{ start: "00:00", end: "24:00" }]],
  ])("orario %s", (text, expected) => {
    expect(times(text)).toEqual(expected);
  });

  it.each(["10-14 16-20", "10-14/16-20", "10-14 · 16-20", "10-14;16-20", "10–14 / 16–20"])(
    "spezzato %s",
    (text) => {
      expect(times(text)).toEqual([
        { start: "10:00", end: "14:00" },
        { start: "16:00", end: "20:00" },
      ]);
    },
  );

  it("ordina le fasce e unisce quelle contigue", () => {
    expect(times("16-20 10-14")).toEqual([
      { start: "10:00", end: "14:00" },
      { start: "16:00", end: "20:00" },
    ]);
    expect(times("10-14 14-20")).toEqual([{ start: "10:00", end: "20:00" }]);
  });

  it("errori in italiano", () => {
    expect(errorOf("14-10")).toMatch(/la fine deve venire dopo l'inizio/);
    expect(errorOf("10-10")).toMatch(/la fine deve venire dopo/);
    expect(errorOf("10-25")).toMatch(/tra 00:00 e 24:00/);
    expect(errorOf("10:70-12")).toMatch(/minuti/);
    expect(errorOf("10:10-12")).toMatch(/quarti d'ora/);
    expect(errorOf("10-14 12-16")).toMatch(/si sovrappongono/);
    expect(errorOf("XYZ")).toMatch(/Codice turno "XYZ" sconosciuto/);
    expect(errorOf("10")).toMatch(/non è una fascia valida/);
    expect(errorOf("10-")).toMatch(/non è una fascia valida/);
  });
});

describe("formattazione dei turni", () => {
  const split = [
    { start: "10:00", end: "14:00" },
    { start: "16:00", end: "20:00" },
  ];

  it("forma compatta", () => {
    expect(formatShiftCompact([{ start: "10:00", end: "20:00" }])).toBe("10–20");
    expect(formatShiftCompact([{ start: "10:30", end: "20:00" }])).toBe("10:30–20");
    expect(formatShiftCompact([{ start: "08:30", end: "10:00" }])).toBe("8:30–10");
    expect(formatShiftCompact(split)).toBe("10–14 · 16–20");
  });

  it("forma estesa", () => {
    expect(formatShiftLong(split)).toBe("10:00–14:00 · 16:00–20:00");
    expect(formatShiftLong([{ start: "8:30", end: "10:00" }])).toBe("08:30–10:00");
  });

  it("la forma compatta si rilegge uguale", () => {
    expect(times(formatShiftCompact(split))).toEqual(split);
  });
});
