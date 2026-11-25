import { describe, expect, it } from "vitest";
import { resolvePublishAt } from "@/app/admin/comunicazioni/publish-at";

const now = new Date("2026-11-26T10:00:00.000Z");

describe("data di pubblicazione di una comunicazione", () => {
  it("la data scelta nell'editor vale sempre", () => {
    expect(resolvePublishAt("2026-12-01T08:00:00.000Z", "2026-11-20T08:00:00+00:00", now)).toBe(
      "2026-12-01T08:00:00.000Z",
    );
  });

  it("nuova senza data: subito", () => {
    expect(resolvePublishAt(null, undefined, now)).toBe(now.toISOString());
  });

  it("già pubblicata senza data: resta quella originale", () => {
    expect(resolvePublishAt(null, "2026-11-20T08:00:00+00:00", now)).toBe(
      "2026-11-20T08:00:00+00:00",
    );
  });

  it("programmata e non ancora uscita, senza data: esce adesso (non resta programmata)", () => {
    expect(resolvePublishAt(null, "2026-11-27T08:00:00+00:00", now)).toBe(now.toISOString());
  });
});
