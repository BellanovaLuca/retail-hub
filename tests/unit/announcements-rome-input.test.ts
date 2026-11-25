import { describe, expect, it } from "vitest";
import { announcementInputSchema, fromRomeLocalInput } from "@/lib/announcements/model";

describe("date dell'editor: valori impossibili", () => {
  it("accetta date vere, febbraio bisestile compreso", () => {
    expect(fromRomeLocalInput("2026-02-28T23:59")).toBe("2026-02-28T22:59:00.000Z");
    expect(fromRomeLocalInput("2028-02-29T00:00")).toBe("2028-02-28T23:00:00.000Z");
    expect(fromRomeLocalInput("2026-12-31T23:30")).toBe("2026-12-31T22:30:00.000Z");
  });

  it("rifiuta giorni che non esistono (prima scorrevano al mese dopo)", () => {
    expect(fromRomeLocalInput("2026-02-31T09:00")).toBeNull();
    expect(fromRomeLocalInput("2026-02-29T09:00")).toBeNull();
    expect(fromRomeLocalInput("2026-04-31T09:00")).toBeNull();
    expect(fromRomeLocalInput("2026-11-00T09:00")).toBeNull();
  });

  it("rifiuta mesi, ore e minuti fuori intervallo", () => {
    expect(fromRomeLocalInput("2026-13-01T09:00")).toBeNull();
    expect(fromRomeLocalInput("2026-00-10T09:00")).toBeNull();
    expect(fromRomeLocalInput("2026-11-25T25:00")).toBeNull();
    expect(fromRomeLocalInput("2026-11-25T24:00")).toBeNull();
    expect(fromRomeLocalInput("2026-11-25T09:60")).toBeNull();
  });

  it("l'editor segnala la data impossibile invece di salvarla spostata", () => {
    const parsed = announcementInputSchema.safeParse({
      title: "Inventario",
      body: "Testo",
      category: "generale",
      audience: "all",
      departmentIds: [],
      profileIds: [],
      pinned: false,
      requiresAck: false,
      publishAt: "2026-02-31T09:00",
      expiresAt: "",
      attachments: [],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."))).toContain(
      "publishAt",
    );
  });
});
