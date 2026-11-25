// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MyWeek } from "@/app/(app)/obiettivi/my-week";

const saveMyEntries = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/obiettivi/actions", () => ({ saveMyEntries }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 2000,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 800,
  });
});
afterEach(() => {
  cleanup();
  saveMyEntries.mockReset();
});

const days = [
  "2026-11-23",
  "2026-11-24",
  "2026-11-25",
  "2026-11-26",
  "2026-11-27",
  "2026-11-28",
  "2026-11-29",
];
const cellOf = (date: string) =>
  document.querySelector<HTMLElement>(`[data-cell][data-row-id="k-wo"][data-col-id="${date}"]`)!;
const debounce = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 750));
  });

function setup() {
  saveMyEntries.mockResolvedValue({ ok: true });
  render(
    <MyWeek
      days={days}
      today="2026-11-25"
      kpis={[{ kpiId: "k-wo", code: "WO", label: "N. WO" }]}
      targets={{ "k-wo": 20000 }}
      comments={{}}
      initialValues={{}}
    />,
  );
  return userEvent.setup();
}

describe("MyWeek · foglio da desktop", () => {
  it("un numero con le migliaia viene salvato, non scartato in silenzio", async () => {
    const user = setup();
    await user.click(cellOf("2026-11-24"));
    await user.keyboard("12345{Enter}");
    // La cella mostra il numero all'italiana e lo stesso valore arriva al server.
    expect(cellOf("2026-11-24").getAttribute("aria-label")).toContain("12.345");
    await debounce();
    expect(saveMyEntries).toHaveBeenCalledWith([
      { kpiId: "k-wo", date: "2026-11-24", value: 12345 },
    ]);
    // Copia/incolla e riempimento usano il testo mostrato ("12.345"): Ctrl+R lo riporta uguale.
    await user.click(cellOf("2026-11-24"));
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}{Control>}r{/Control}");
    await debounce();
    expect(saveMyEntries).toHaveBeenLastCalledWith([
      { kpiId: "k-wo", date: "2026-11-25", value: 12345 },
    ]);
  });

  it("un valore che non è un numero viene segnalato", async () => {
    const user = setup();
    await user.click(cellOf("2026-11-25"));
    await user.keyboard("abc{Enter}");
    expect(screen.getByRole("alert").textContent).toContain("Scrivi un numero");
    await debounce();
    expect(saveMyEntries).not.toHaveBeenCalled();
  });
});
