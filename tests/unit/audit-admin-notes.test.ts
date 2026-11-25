import { describe, expect, it } from "vitest";
import { ENTITY_LABELS, subjectProfileId, summarizeDiff } from "@/lib/audit";

describe("registro modifiche · note riservate (profile_admin_notes)", () => {
  it("non mostra mai il testo delle note, né alla creazione né alla modifica", () => {
    expect(
      summarizeDiff(
        "insert",
        { profile_id: "p1", notes: "testo riservato" },
        6,
        "profile_admin_notes",
      ),
    ).toEqual(["profile_id: p1", "notes: (riservato)"]);
    expect(
      summarizeDiff(
        "update",
        { notes: { before: "prima", after: "dopo" } },
        6,
        "profile_admin_notes",
      ),
    ).toEqual(["notes: modificato"]);
    expect(
      summarizeDiff(
        "delete",
        { profile_id: "p1", notes: "testo riservato" },
        6,
        "profile_admin_notes",
      ),
    ).toEqual(["profile_id: p1", "notes: (riservato)"]);
  });

  it("nelle altre tabelle una colonna «notes» resta un campo qualsiasi", () => {
    expect(
      summarizeDiff("update", { notes: { before: "a", after: "b" } }, 6, "store_weekly_targets"),
    ).toEqual(["notes: a → b"]);
    expect(summarizeDiff("update", { notes: { before: "a", after: "b" } })).toEqual([
      "notes: a → b",
    ]);
  });

  it("ha un'etichetta e riconosce la persona interessata anche nelle modifiche", () => {
    expect(ENTITY_LABELS.profile_admin_notes).toBeTruthy();
    expect(
      subjectProfileId("profile_admin_notes", "p1", { notes: { before: "a", after: "b" } }),
    ).toBe("p1");
  });
});
