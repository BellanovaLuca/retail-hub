import { describe, expect, it } from "vitest";
import { lockedUntil, type LoginAttempt } from "@/lib/auth/lockout";

const now = new Date("2026-10-17T10:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const fail = (m: number): LoginAttempt => ({ at: minutesAgo(m), success: false });
const ok = (m: number): LoginAttempt => ({ at: minutesAgo(m), success: true });

describe("blocco dopo i tentativi errati", () => {
  it("4 errori non bloccano", () => {
    expect(lockedUntil([fail(4), fail(3), fail(2), fail(1)], 5, now)).toBeNull();
  });

  it("5 errori bloccano per 15 minuti dal quinto ultimo errore", () => {
    const until = lockedUntil([fail(5), fail(4), fail(3), fail(2), fail(1)], 5, now);
    expect(until).toEqual(new Date(minutesAgo(5).getTime() + 15 * 60_000));
  });

  it("un accesso riuscito azzera il conteggio", () => {
    expect(lockedUntil([fail(6), fail(5), fail(4), ok(3), fail(2), fail(1)], 5, now)).toBeNull();
  });

  it("gli errori fuori finestra non contano", () => {
    expect(lockedUntil([fail(30), fail(20), fail(16), fail(3), fail(1)], 5, now)).toBeNull();
  });
});
