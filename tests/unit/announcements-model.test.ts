import { describe, expect, it } from "vitest";
import {
  announcementInputSchema,
  fromRomeLocalInput,
  isLive,
  isRecipient,
  needsAttention,
  orderFeed,
  orderUnread,
  parseAttachments,
  storageFileName,
  toRomeLocalInput,
} from "@/lib/announcements/model";

describe("destinatari", () => {
  const person = { id: "p1", departmentIds: ["ottici"] };
  it("tutti", () => {
    expect(isRecipient({ audience: "all", department_ids: [], profile_ids: [] }, person)).toBe(
      true,
    );
  });
  it("reparti", () => {
    const a = { audience: "department" as const, department_ids: ["ottici"], profile_ids: [] };
    expect(isRecipient(a, person)).toBe(true);
    expect(isRecipient({ ...a, department_ids: ["vendita"] }, person)).toBe(false);
  });
  it("persone", () => {
    const a = { audience: "people" as const, department_ids: [], profile_ids: ["p2"] };
    expect(isRecipient(a, person)).toBe(false);
    expect(isRecipient({ ...a, profile_ids: ["p1"] }, person)).toBe(true);
  });
});

describe("visibilità", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  it("programmata nel futuro: non ancora visibile", () => {
    expect(isLive({ publish_at: "2026-10-18T08:00:00Z", expires_at: null }, now)).toBe(false);
  });
  it("scaduta", () => {
    expect(
      isLive({ publish_at: "2026-10-01T08:00:00Z", expires_at: "2026-10-17T09:00:00Z" }, now),
    ).toBe(false);
  });
  it("pubblicata", () => {
    expect(isLive({ publish_at: "2026-10-01T08:00:00Z", expires_at: null }, now)).toBe(true);
  });
});

describe("ordinamento", () => {
  const base = {
    pinned: false,
    category: "generale",
    requires_ack: false,
    read: true,
    acknowledged: false,
  };
  const items = [
    { ...base, id: "vecchia", publish_at: "2026-10-01T00:00:00Z" },
    { ...base, id: "nuova", publish_at: "2026-10-10T00:00:00Z" },
    { ...base, id: "fissata", pinned: true, publish_at: "2026-09-01T00:00:00Z" },
    {
      ...base,
      id: "urgente",
      category: "urgente",
      read: false,
      publish_at: "2026-09-02T00:00:00Z",
    },
    {
      ...base,
      id: "urgente-letta",
      category: "urgente",
      read: true,
      publish_at: "2026-09-03T00:00:00Z",
    },
    { ...base, id: "conferma", requires_ack: true, publish_at: "2026-09-04T00:00:00Z" },
  ];

  it("bacheca: fissate, poi urgenti e da confermare non lette, poi per data", () => {
    expect(orderFeed(items).map((i) => i.id)).toEqual([
      "fissata",
      "conferma",
      "urgente",
      "nuova",
      "vecchia",
      "urgente-letta",
    ]);
  });

  it("home: urgenti e da confermare in testa", () => {
    expect(
      orderUnread(items)
        .map((i) => i.id)
        .slice(0, 3),
    ).toEqual(["conferma", "urgente", "fissata"]);
  });

  it("da confermare resta in sospeso finché non si conferma", () => {
    expect(needsAttention({ requires_ack: true }, { read: true, acknowledged: false })).toBe(true);
    expect(needsAttention({ requires_ack: true }, { read: true, acknowledged: true })).toBe(false);
    expect(needsAttention({ requires_ack: false }, { read: false, acknowledged: false })).toBe(
      true,
    );
  });
});

describe("date dell'editor (ora di Roma)", () => {
  it("ora legale", () => {
    expect(fromRomeLocalInput("2026-10-17T09:30")).toBe("2026-10-17T07:30:00.000Z");
    expect(toRomeLocalInput("2026-10-17T07:30:00.000Z")).toBe("2026-10-17T09:30");
  });
  it("ora solare", () => {
    expect(fromRomeLocalInput("2026-12-01T09:30")).toBe("2026-12-01T08:30:00.000Z");
  });
  it("valori non validi", () => {
    expect(fromRomeLocalInput("domani")).toBeNull();
    expect(toRomeLocalInput(null)).toBe("");
  });
});

describe("validazione dell'editor", () => {
  const valid = {
    title: "Inventario",
    body: "Testo",
    category: "generale",
    audience: "all",
    departmentIds: [],
    profileIds: [],
    pinned: false,
    requiresAck: true,
    publishAt: "",
    expiresAt: "",
    attachments: [],
  };
  it("accetta un input valido", () => {
    expect(announcementInputSchema.safeParse(valid).success).toBe(true);
  });
  it("reparti senza reparto", () => {
    const r = announcementInputSchema.safeParse({ ...valid, audience: "department" });
    expect(r.success).toBe(false);
  });
  it("scadenza prima della pubblicazione", () => {
    const r = announcementInputSchema.safeParse({
      ...valid,
      publishAt: "2026-10-20T09:00",
      expiresAt: "2026-10-19T09:00",
    });
    expect(r.success).toBe(false);
  });
});

describe("allegati", () => {
  it("parse tollerante", () => {
    expect(parseAttachments([{ path: "a/b.pdf", name: "b.pdf", size: 10 }, { foo: 1 }])).toEqual([
      { path: "a/b.pdf", name: "b.pdf", size: 10 },
    ]);
    expect(parseAttachments(null)).toEqual([]);
  });
  it("nome file sicuro", () => {
    expect(storageFileName("Procedura però (v2).pdf")).toBe("Procedura-pero-v2-.pdf");
    expect(storageFileName("../../etc/passwd")).toBe("etc-passwd");
  });
});
