import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine } from "@/lib/ical";

describe("iCal", () => {
  it("genera un evento con orario locale di Roma", () => {
    const ics = buildIcs({
      calendarName: "Turni · Fra R.",
      location: "Salmoiraghi & Viganò — Piazza Cordusio",
      events: [
        {
          uid: "abc@staff-cordusio",
          date: "2026-10-14",
          start: "10:00",
          end: "14:30",
          summary: "Turno",
          description: "Area: Sole",
          stamp: "2026-10-10T08:00:00Z",
        },
      ],
    });
    expect(ics).toContain("DTSTART;TZID=Europe/Rome:20261014T100000");
    expect(ics).toContain("DTEND;TZID=Europe/Rome:20261014T143000");
    expect(ics).toContain("DTSTAMP:20261010T080000Z");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("fa l'escape dei caratteri speciali e spezza le righe lunghe", () => {
    expect(escapeText("a,b;c\nd")).toBe("a\\,b\\;c\\nd");
    const folded = foldLine(`DESCRIPTION:${"è".repeat(60)}`);
    expect(folded.split("\r\n ").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
