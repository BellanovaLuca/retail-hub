import { describe, expect, it } from "vitest";
import { choiceHours } from "@/components/leaves/leave-form-fields";

describe("choiceHours", () => {
  it("giornata intera se non è un permesso o il campo è vuoto", () => {
    expect(choiceHours({ type: "ferie", status: "confirmed", hours: "abc" })).toEqual({
      ok: true,
      hours: null,
    });
    expect(choiceHours({ type: "permesso", status: "confirmed", hours: " " })).toEqual({
      ok: true,
      hours: null,
    });
  });

  it("ore valide, con la virgola", () => {
    expect(choiceHours({ type: "permesso", status: "confirmed", hours: "4,5" })).toEqual({
      ok: true,
      hours: 4.5,
    });
    expect(choiceHours({ type: "permesso", status: "confirmed", hours: "12" })).toEqual({
      ok: true,
      hours: 12,
    });
  });

  it("testo non numerico o fuori regola: errore, non silenzio", () => {
    expect(choiceHours({ type: "permesso", status: "confirmed", hours: "abc" })).toEqual({
      ok: false,
      error: "Indica le ore (es. 4 o 4,5).",
    });
    expect(choiceHours({ type: "permesso", status: "confirmed", hours: "13" })).toEqual({
      ok: false,
      error: "Massimo 12 ore.",
    });
    expect(choiceHours({ type: "permesso", status: "confirmed", hours: "4,3" })).toEqual({
      ok: false,
      error: "A mezz'ore.",
    });
    expect(choiceHours({ type: "permesso", status: "confirmed", hours: "0" })).toMatchObject({
      ok: false,
    });
  });
});
