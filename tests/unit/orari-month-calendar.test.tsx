// @vitest-environment jsdom
/**
 * «I miei orari», vista mese: un'assenza a giornata intera prevale sul turno rimasto
 * nell'orario pubblicato (ferie approvate dopo la pubblicazione); un permesso di poche ore si
 * vede accanto al turno.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MonthCalendar } from "@/app/(app)/orari/month-calendar";

afterEach(cleanup);

describe("MonthCalendar", () => {
  it("ferie sopra un turno pubblicato: si vede l'assenza, il turno resta barrato", () => {
    render(
      <MonthCalendar
        month="2026-12"
        today="2026-12-01"
        days={{
          "2026-12-07": { text: "10–19", changed: true, work: true },
          "2026-12-08": { text: "10–19", changed: false, work: true },
          "2026-12-09": { text: "Riposo", changed: false, work: false },
          "2026-12-10": { text: "10–14", changed: false, work: true },
        }}
        leaves={{
          "2026-12-07": { label: "Ferie", fullDay: true },
          "2026-12-09": { label: "Ferie", fullDay: true },
          "2026-12-10": { label: "Permesso 2h", fullDay: false },
          "2026-12-11": { label: "Malattia", fullDay: true },
        }}
      />,
    );
    const cell = (day: string) => {
      const li = screen.getAllByRole("listitem").filter((el) => {
        const number = el.querySelector("span");
        return number?.textContent === day && !el.className.includes("text-subtle");
      })[0];
      if (!li) throw new Error(`giorno ${day} non trovato`);
      return li;
    };
    // 7: assenza in evidenza, turno barrato, niente pallino «Modificato».
    expect(cell("7").textContent).toContain("Ferie");
    expect(cell("7").querySelector(".line-through")?.textContent).toBe("10–19");
    expect(cell("7").querySelector("[aria-label=Modificato]")).toBeNull();
    // 8: giorno normale.
    expect(cell("8").textContent).toBe("810–19");
    expect(cell("8").querySelector(".line-through")).toBeNull();
    // 9: il riposo scritto nel foglio non si mostra sotto le ferie.
    expect(cell("9").textContent).toBe("9Ferie");
    // 10: turno e permesso a ore insieme.
    expect(cell("10").textContent).toBe("1010–14Permesso 2h");
    // 11: solo l'assenza.
    expect(cell("11").textContent).toBe("11Malattia");
  });
});
