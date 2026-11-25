import { describe, expect, it } from "vitest";
import { isSessionExpired, SESSION_MAX_AGE_SECONDS, sessionStartedAt } from "./session-age";

const day = 86_400;
const login = 1_800_000_000;

describe("durata massima della sessione", () => {
  it("l'accesso è il primo metodo che non sia un rinnovo del token", () => {
    expect(
      sessionStartedAt({
        amr: [
          { method: "token_refresh", timestamp: login + 20 * day },
          { method: "password", timestamp: login },
        ],
      }),
    ).toBe(login);
    // Solo rinnovi, forma vecchia (stringhe) o claim assente: non si sa.
    expect(sessionStartedAt({ amr: [{ method: "token_refresh", timestamp: login }] })).toBeNull();
    expect(sessionStartedAt({ amr: ["password"] })).toBeNull();
    expect(sessionStartedAt({ amr: [{ method: "password", timestamp: "ieri" }] })).toBeNull();
    expect(sessionStartedAt({})).toBeNull();
    expect(sessionStartedAt(null)).toBeNull();
  });

  it("scade 30 giorni dopo l'accesso, anche se il token è stato rinnovato da poco", () => {
    const claims = {
      amr: [
        { method: "password", timestamp: login },
        { method: "token_refresh", timestamp: login + 30 * day },
      ],
    };
    expect(isSessionExpired(claims, login + 29 * day)).toBe(false);
    expect(isSessionExpired(claims, login + SESSION_MAX_AGE_SECONDS)).toBe(false);
    expect(isSessionExpired(claims, login + SESSION_MAX_AGE_SECONDS + 1)).toBe(true);
  });

  it("senza istante dell'accesso non scade (decide il database)", () => {
    expect(isSessionExpired({ sub: "x" }, login + 400 * day)).toBe(false);
  });
});
