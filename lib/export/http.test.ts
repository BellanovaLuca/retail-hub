import { describe, expect, it } from "vitest";
import { fileSlug } from "./http";

describe("nome file degli export", () => {
  it("riduce il testo a lettere minuscole, cifre e trattini", () => {
    expect(fileSlug("Addetti vendita")).toBe("addetti-vendita");
    expect(fileSlug("Qualità & Contattologia")).toBe("qualita-contattologia");
  });

  it("toglie virgolette e caratteri che romperebbero l'intestazione", () => {
    expect(fileSlug('Sole — "Vista"\r\nX-Evil: 1')).toBe("sole-vista-x-evil-1");
    expect(fileSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(fileSlug("🕶️")).toBe("");
  });

  it("il risultato è sempre accettato come intestazione HTTP", () => {
    const name = `ferie-2026-${fileSlug("Ottici — Sole")}.pdf`;
    expect(() => new Headers({ "Content-Disposition": `attachment; filename="${name}"` })).not.toThrow();
  });
});
