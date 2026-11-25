import { describe, expect, it } from "vitest";
import { DAILY_QUOTES, dailyQuote } from "@/lib/daily-quote";

describe("frase del giorno", () => {
  it("è la stessa per tutto il giorno e cambia il giorno dopo", () => {
    expect(dailyQuote("2026-11-26")).toBe(dailyQuote("2026-11-26"));
    expect(dailyQuote("2026-11-27")).not.toBe(dailyQuote("2026-11-26"));
    // Anche a cavallo di mese e anno.
    expect(dailyQuote("2026-12-01")).not.toBe(dailyQuote("2026-11-30"));
    expect(dailyQuote("2027-01-01")).not.toBe(dailyQuote("2026-12-31"));
  });

  it("scorre tutto l'elenco prima di ripetersi", () => {
    const seen = new Set<string>();
    const start = Date.UTC(2026, 10, 26);
    for (let i = 0; i < DAILY_QUOTES.length; i++) {
      seen.add(dailyQuote(new Date(start + i * 86_400_000).toISOString().slice(0, 10)));
    }
    expect(seen.size).toBe(DAILY_QUOTES.length);
  });

  it("le frasi sono tutte diverse e brevi", () => {
    expect(new Set(DAILY_QUOTES).size).toBe(DAILY_QUOTES.length);
    expect(DAILY_QUOTES.length).toBeGreaterThanOrEqual(100);
    for (const q of DAILY_QUOTES) expect(q.length).toBeLessThanOrEqual(110);
  });
});
