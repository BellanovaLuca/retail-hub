import { describe, expect, it } from "vitest";
import { countdownLabel, romeClock } from "@/app/(app)/countdown-label";

const at = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

describe("conto alla rovescia del turno di oggi", () => {
  const intero = [{ start: "10:00", end: "19:00" }];
  const spezzato = [
    { start: "14:00", end: "19:00" },
    { start: "10:00", end: "13:00" },
  ];

  it("prima del turno: minuti, poi ore e minuti", () => {
    expect(countdownLabel(intero, at("09:15"))).toBe("Tra 45 min");
    expect(countdownLabel(intero, at("07:55"))).toBe("Tra 2 h 05 min");
  });

  it("durante il turno è in corso; dopo la fine non mostra nulla", () => {
    expect(countdownLabel(intero, at("10:00"))).toBe("In corso");
    expect(countdownLabel(intero, at("18:59"))).toBe("In corso");
    expect(countdownLabel(intero, at("19:00"))).toBeNull();
  });

  it("turno spezzato: nella pausa non è in corso, conta verso il secondo pezzo", () => {
    expect(countdownLabel(spezzato, at("09:30"))).toBe("Tra 30 min");
    expect(countdownLabel(spezzato, at("12:00"))).toBe("In corso");
    expect(countdownLabel(spezzato, at("13:00"))).toBe("Riprendi tra 1 h 00 min");
    expect(countdownLabel(spezzato, at("13:40"))).toBe("Riprendi tra 20 min");
    expect(countdownLabel(spezzato, at("14:00"))).toBe("In corso");
    expect(countdownLabel(spezzato, at("19:30"))).toBeNull();
  });

  it("pezzo senza orario di fine: in corso da quando comincia", () => {
    expect(countdownLabel([{ start: "10:00", end: null }], at("09:00"))).toBe("Tra 1 h 00 min");
    expect(countdownLabel([{ start: "10:00", end: null }], at("15:00"))).toBe("In corso");
  });

  it("nessun pezzo", () => {
    expect(countdownLabel([], at("10:00"))).toBeNull();
  });
});

describe("orologio di Roma", () => {
  it("ora solare e ora legale", () => {
    expect(romeClock(new Date("2026-11-25T08:30:00Z"))).toEqual({
      date: "2026-11-25",
      minutes: at("09:30"),
    });
    expect(romeClock(new Date("2026-07-01T08:30:00Z"))).toEqual({
      date: "2026-07-01",
      minutes: at("10:30"),
    });
  });
  it("a cavallo di mezzanotte il giorno è quello di Roma, e mezzanotte vale 0 minuti", () => {
    expect(romeClock(new Date("2026-11-29T23:30:00Z"))).toEqual({
      date: "2026-11-30",
      minutes: 30,
    });
    expect(romeClock(new Date("2026-11-29T23:00:00Z"))).toEqual({ date: "2026-11-30", minutes: 0 });
  });
});
