import { describe, expect, it } from "vitest";
import { subjectProfileId, summarizeDiff } from "@/lib/audit";

describe("registro modifiche", () => {
  it("riassume una modifica come prima → dopo, senza campi tecnici", () => {
    const lines = summarizeDiff("update", {
      weekly_hours: { before: 40, after: 32 },
      updated_at: { before: "x", after: "y" },
      active: { before: true, after: false },
    });
    expect(lines).toEqual(["weekly_hours: 40 → 32", "active: sì → no"]);
  });

  it("non mostra mai note riservate", () => {
    expect(summarizeDiff("update", { admin_notes: { before: "a", after: "b" } })).toEqual([
      "admin_notes: modificato",
    ]);
    expect(summarizeDiff("insert", { private_note: "segreto", title: "Lenti" })).toEqual([
      "private_note: (riservato)",
      "title: Lenti",
    ]);
  });

  it("individua la persona interessata", () => {
    expect(subjectProfileId("profiles", "p1", {})).toBe("p1");
    expect(subjectProfileId("leaves", "l1", { profile_id: "p2" })).toBe("p2");
    expect(subjectProfileId("shifts", "s1", { profile_id: { before: "p3", after: "p4" } })).toBe(
      "p4",
    );
    expect(subjectProfileId("holidays", "h1", { date: "2026-12-25" })).toBeNull();
  });
});
