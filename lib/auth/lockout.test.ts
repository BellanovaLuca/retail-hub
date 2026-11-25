import { describe, expect, it } from "vitest";
import { lockoutMessage } from "./lockout";

const now = new Date("2026-11-26T10:00:00Z");

describe("messaggio di blocco", () => {
  it("arrotonda per eccesso ai minuti mancanti", () => {
    expect(lockoutMessage(new Date("2026-11-26T10:14:10Z"), now)).toBe(
      "Troppi tentativi errati. Riprova tra 15 minuti.",
    );
    expect(lockoutMessage(new Date("2026-11-26T10:00:30Z"), now)).toBe(
      "Troppi tentativi errati. Riprova tra 1 minuto.",
    );
  });

  it("non scende mai sotto un minuto", () => {
    expect(lockoutMessage(new Date("2026-11-26T09:59:00Z"), now)).toBe(
      "Troppi tentativi errati. Riprova tra 1 minuto.",
    );
  });
});
