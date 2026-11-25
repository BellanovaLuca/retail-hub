import { describe, expect, it } from "vitest";
import {
  hourCellValue,
  markedSlotsToSegments,
  repaintedSegments,
  segmentsToMarkedSlots,
  segmentsToSlots,
  SLOT_COUNT,
  slotIndex,
  slotsToSegments,
  slotTime,
  type MarkedSegment,
  type SlotMark,
} from "@/lib/shifts/slots";

describe("mezze celle del foglio orario", () => {
  it("30 mezze celle dalle 07:00 alle 22:00", () => {
    expect(SLOT_COUNT).toBe(30);
    expect(slotIndex("07:00")).toBe(0);
    expect(slotIndex("07:29")).toBe(0);
    expect(slotIndex("10:30")).toBe(7);
    expect(slotIndex("21:30")).toBe(29);
    expect(slotIndex("06:30")).toBe(-1);
    expect(slotTime(0)).toBe("07:00");
    expect(slotTime(7)).toBe("10:30");
    expect(slotTime(30)).toBe("22:00");
  });

  it("fasce → mezze celle e ritorno, con la pausa come vuoto", () => {
    const segments = [
      { start: "10:00", end: "13:00" },
      { start: "14:00", end: "19:00" },
    ];
    const slots = segmentsToSlots(segments);
    expect(slots.filter(Boolean)).toHaveLength(16);
    expect(slots[slotIndex("13:00")]).toBe(false);
    expect(slotsToSegments(slots)).toEqual(segments);
  });

  it("dipingere celle sparse produce uno spezzato", () => {
    const slots = Array<boolean>(SLOT_COUNT).fill(false);
    for (let i = slotIndex("10:00"); i < slotIndex("12:00"); i++) slots[i] = true;
    slots[slotIndex("16:30")] = true;
    expect(slotsToSegments(slots)).toEqual([
      { start: "10:00", end: "12:00" },
      { start: "16:30", end: "17:00" },
    ]);
  });

  it("una fascia che tocca in parte una mezza cella la dipinge; fuori griglia si taglia", () => {
    const slots = segmentsToSlots([{ start: "10:15", end: "11:00" }]);
    expect(slotsToSegments(slots)).toEqual([{ start: "10:00", end: "11:00" }]);
    expect(slotsToSegments(segmentsToSlots([{ start: "06:00", end: "08:00" }]))).toEqual([
      { start: "07:00", end: "08:00" },
    ]);
  });

  it("cella ORA: 1, 0,5 o vuota", () => {
    const slots = segmentsToSlots([{ start: "10:30", end: "12:00" }]);
    expect(hourCellValue(slots, 9)).toBe(0);
    expect(hourCellValue(slots, 10)).toBe(0.5);
    expect(hourCellValue(slots, 11)).toBe(1);
  });

  it("back office: mezze celle 'bo' → fasce con il flag, la vendita spezza il turno", () => {
    const marks: SlotMark[] = Array<SlotMark>(SLOT_COUNT).fill(null);
    for (let i = slotIndex("08:30"); i < slotIndex("10:00"); i++) marks[i] = "bo";
    for (let i = slotIndex("10:00"); i < slotIndex("17:30"); i++) marks[i] = "sale";
    const segments = markedSlotsToSegments(marks);
    expect(segments).toEqual([
      { start: "08:30", end: "10:00", backOffice: true },
      { start: "10:00", end: "17:30", backOffice: false },
    ]);
    expect(segmentsToMarkedSlots(segments)).toEqual(marks);
    expect(hourCellValue(marks, 8)).toBe(0.5);
    expect(hourCellValue(marks, 9)).toBe(1);
  });
});

describe("giornata ridipinta: si applicano solo le mezze celle cambiate", () => {
  const sale = (start: string, end: string): MarkedSegment => ({ start, end, backOffice: false });
  const bo = (start: string, end: string): MarkedSegment => ({ start, end, backOffice: true });
  /** Mezze celle dipinte dai turni, con le modifiche dell'admin (orario della cella → segno). */
  const repaint = (original: MarkedSegment[], changes: Record<string, SlotMark>) => {
    const marks = segmentsToMarkedSlots(original);
    for (const [time, mark] of Object.entries(changes)) marks[slotIndex(time)] = mark;
    return repaintedSegments(original, marks);
  };

  it("senza modifiche restituisce i turni com'erano", () => {
    const day = [sale("10:15", "18:45")];
    expect(repaint(day, {})).toEqual(day);
    expect(repaint([sale("06:00", "14:00"), sale("21:00", "23:00")], {})).toEqual([
      sale("06:00", "14:00"),
      sale("21:00", "23:00"),
    ]);
  });

  it("i quarti d'ora non toccati restano: 10:15–18:45 non diventa 10:00–19:00", () => {
    // Una cella in più lontano dal turno: il turno resta identico.
    expect(repaint([sale("10:15", "18:45")], { "20:00": "sale" })).toEqual([
      sale("10:15", "18:45"),
      sale("20:00", "20:30"),
    ]);
    // Una pausa scavata in mezzo: gli estremi restano 10:15 e 18:45.
    expect(repaint([sale("10:15", "18:45")], { "13:00": null, "13:30": null })).toEqual([
      sale("10:15", "13:00"),
      sale("14:00", "18:45"),
    ]);
    // Allungare il turno dalla cella accanto: arriva al bordo, senza un vuoto di un quarto d'ora.
    expect(repaint([sale("10:15", "18:45")], { "19:00": "sale" })).toEqual([
      sale("10:15", "19:30"),
    ]);
    expect(repaint([sale("10:15", "18:45")], { "09:30": "sale" })).toEqual([
      sale("09:30", "18:45"),
    ]);
    // Svuotare la mezza cella toccata in parte toglie quel pezzo.
    expect(repaint([sale("10:15", "18:45")], { "18:30": null })).toEqual([sale("10:15", "18:30")]);
  });

  it("le ore fuori dalla griglia 07–22 non vengono tagliate", () => {
    expect(repaint([sale("06:00", "14:00"), sale("21:00", "23:00")], { "17:00": "sale" })).toEqual([
      sale("06:00", "14:00"),
      sale("17:00", "17:30"),
      sale("21:00", "23:00"),
    ]);
  });

  it("vendita ↔ back office: cambia il tipo, non gli orari", () => {
    const marks = segmentsToMarkedSlots([sale("08:30", "17:45")]);
    marks[slotIndex("08:30")] = "bo";
    marks[slotIndex("09:00")] = "bo";
    marks[slotIndex("09:30")] = "bo";
    expect(repaintedSegments([sale("08:30", "17:45")], marks)).toEqual([
      bo("08:30", "10:00"),
      sale("10:00", "17:45"),
    ]);
    // Tutto il turno in back office: gli estremi restano 10:15 e 18:45.
    const all = segmentsToMarkedSlots([sale("10:15", "18:45")]).map((m) => (m ? "bo" : null));
    expect(repaintedSegments([sale("10:15", "18:45")], all)).toEqual([bo("10:15", "18:45")]);
  });

  it("giornata vuota dipinta da zero: come le mezze celle", () => {
    const marks = segmentsToMarkedSlots([]);
    for (const t of ["10:00", "10:30", "11:00", "14:00"]) marks[slotIndex(t)] = "sale";
    expect(repaintedSegments([], marks)).toEqual(markedSlotsToSegments(marks));
  });
});
