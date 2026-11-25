import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("ritorno dopo l'accesso", () => {
  it("accetta i percorsi interni, con la query", () => {
    expect(safeReturnPath("/orari")).toBe("/orari");
    expect(safeReturnPath("/orari?settimana=2026-11-23")).toBe("/orari?settimana=2026-11-23");
    expect(safeReturnPath("/admin/turni/2026-11-23")).toBe("/admin/turni/2026-11-23");
  });

  it("senza valore torna alla Home", () => {
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("")).toBe("/");
  });

  it("rifiuta gli indirizzi esterni", () => {
    for (const da of [
      "//evil.example/x",
      "/\\evil.example/x",
      "https://evil.example/x",
      "javascript:alert(1)",
      "orari",
    ]) {
      expect(safeReturnPath(da), da).toBe("/");
    }
  });

  it("rifiuta tab e a-capo, che il browser toglierebbe (/\\t/evil → //evil)", () => {
    for (const da of ["/\t/evil.example/x", "/\n/evil.example", "/\r/evil.example", "/\u0000x"]) {
      expect(safeReturnPath(da), JSON.stringify(da)).toBe("/");
    }
  });

  it("i punti non portano fuori dal sito né a un doppio slash", () => {
    expect(safeReturnPath("/a/../../orari")).toBe("/orari");
    expect(safeReturnPath("/.//evil.example")).toBe("/");
  });

  it("non rimanda a uscita, accesso o API", () => {
    expect(safeReturnPath("/esci")).toBe("/");
    expect(safeReturnPath("/accesso?da=/x")).toBe("/");
    expect(safeReturnPath("/api/export/turni/2026-11-23")).toBe("/");
  });
});
