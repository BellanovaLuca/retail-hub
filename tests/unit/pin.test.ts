import { describe, expect, it } from "vitest";
import {
  credentialsMessage,
  generatePin,
  isTrivialPin,
  nextEmployeeCode,
  normalizeEmployeeCode,
  syntheticEmail,
  validateNewPin,
} from "@/lib/auth/pin";

describe("codice dipendente", () => {
  it("normalizza spazi e maiuscole", () => {
    expect(normalizeEmployeeCode("  crd 014 ")).toBe("CRD-014");
    expect(normalizeEmployeeCode("crd--014")).toBe("CRD-014");
  });

  it("costruisce l'email sintetica in minuscolo", () => {
    expect(syntheticEmail("CRD-014")).toBe("crd-014@staff.cordusio.local");
  });

  it("propone il codice successivo", () => {
    expect(nextEmployeeCode([])).toBe("CRD-001");
    expect(nextEmployeeCode(["CRD-001", "CRD-014", "ADM-099", "CRD-X"])).toBe("CRD-015");
  });
});

describe("PIN banali", () => {
  it.each(["000000", "111111", "123456", "654321", "456789", "12345678", "98765432"])(
    "%s è banale",
    (pin) => {
      expect(isTrivialPin(pin)).toBe(true);
    },
  );

  // Date e blocchi ripetuti sono ammessi: il controllo rifiutava troppi PIN normali.
  it.each(["482913", "907354", "39182746", "250390", "121212", "123123", "25031990"])(
    "%s va bene",
    (pin) => {
      expect(isTrivialPin(pin)).toBe(false);
    },
  );
});

describe("validazione del nuovo PIN", () => {
  it("dipendente: esattamente 6 cifre", () => {
    expect(validateNewPin("48291", "employee")).toMatch(/6 cifre/);
    expect(validateNewPin("4829135", "employee")).toMatch(/6 cifre/);
    expect(validateNewPin("48a913", "employee")).toMatch(/solo cifre/);
    expect(validateNewPin("482913", "employee")).toBeNull();
  });

  it("admin: almeno 8 cifre", () => {
    expect(validateNewPin("482913", "admin")).toMatch(/almeno 8/);
    expect(validateNewPin("3918274605", "admin")).toBeNull();
  });

  it("rifiuta i PIN banali", () => {
    expect(validateNewPin("123456", "employee")).toMatch(/facile/);
  });
});

describe("PIN provvisorio", () => {
  it("ha la lunghezza giusta e non è banale", () => {
    for (let i = 0; i < 200; i++) {
      const pin = generatePin("employee");
      expect(pin).toMatch(/^\d{6}$/);
      expect(isTrivialPin(pin)).toBe(false);
    }
    expect(generatePin("admin")).toMatch(/^\d{8}$/);
  });

  it("prepara il messaggio da inviare", () => {
    const text = credentialsMessage({
      appUrl: "https://esempio.vercel.app",
      displayName: "Fra R.",
      code: "CRD-014",
      pin: "482913",
    });
    expect(text).toContain("CRD-014");
    expect(text).toContain("482913");
    expect(text).toContain("https://esempio.vercel.app");
  });
});
