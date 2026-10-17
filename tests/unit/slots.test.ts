import { describe, expect, it } from "vitest";
import {
  hourCellValue,
  markedSlotsToSegments,
  segmentsToMarkedSlots,
  segmentsToSlots,
  SLOT_COUNT,
  slotIndex,
  slotsToSegments,
  slotTime,
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
