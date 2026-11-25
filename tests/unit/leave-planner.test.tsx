// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LeavePlanner, type LeavePlannerProps } from "@/components/leaves/leave-planner";
import type { PlannerLeave } from "@/components/leaves/types";

const saveLeaveCells = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/ferie/actions", () => ({
  saveLeaveCells,
  saveLeaveRange: vi.fn(),
  saveLeaveDay: vi.fn(),
  saveLeaveThresholds: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// jsdom non calcola il layout: il virtualizzatore ha bisogno di una dimensione.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 4000,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 800,
  });
});
afterEach(() => {
  cleanup();
  saveLeaveCells.mockReset();
});

const D2 = "2026-11-02";
const D3 = "2026-11-03";
const props = (leaves: PlannerLeave[]): LeavePlannerProps => ({
  mode: "admin",
  year: 2026,
  today: "2026-11-25",
  people: [
    {
      id: "p1",
      displayName: "Anna",
      color: null,
      primaryDepartmentId: "d1",
      departmentIds: ["d1"],
    },
  ],
  departments: [{ id: "d1", name: "Ottici" }],
  leaves,
  holidays: [],
  thresholds: {},
  initial: { view: "persone", period: "mese", month: 11, department: "" },
});
const ferie = (date: string): PlannerLeave => ({
  profileId: "p1",
  date,
  type: "ferie",
  hours: null,
  status: "confirmed",
  source: "planning",
});
const cellOf = (date: string) =>
  document.querySelector<HTMLElement>(`[data-cell][data-row-id="p1"][data-col-id="${date}"]`)!;
const textOf = (date: string) => cellOf(date).getAttribute("aria-label")!.split(": ")[1];

describe("LeavePlanner · modifiche ottimistiche", () => {
  it("i dati ricaricati dopo un salvataggio non cancellano la cella scritta nel frattempo", async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    saveLeaveCells.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const user = userEvent.setup();
    const { rerender } = render(<LeavePlanner {...props([])} />);

    await user.click(cellOf(D2));
    await user.keyboard("f{Enter}");
    await user.click(cellOf(D3));
    await user.keyboard("f?{Enter}");
    expect(saveLeaveCells).toHaveBeenCalledTimes(2);
    expect(textOf(D2)).toBe("F");
    expect(textOf(D3)).toBe("F?");

    // Il primo salvataggio finisce e arrivano i dati ricaricati (senza ancora il 3 novembre),
    // mentre il secondo è ancora in corso: la cella del 3 resta com'è stata scritta.
    await act(async () => {
      resolvers[0]({ ok: true, data: {} });
    });
    rerender(<LeavePlanner {...props([ferie(D2)])} />);
    expect(textOf(D2)).toBe("F");
    expect(textOf(D3)).toBe("F?");

    await act(async () => {
      resolvers[1]({ ok: true, data: {} });
    });
    rerender(<LeavePlanner {...props([ferie(D2), { ...ferie(D3), status: "tentative" }])} />);
    expect(textOf(D3)).toBe("F?");
  });

  it("server non raggiungibile: errore visibile e la cella torna al valore salvato", async () => {
    saveLeaveCells.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    const { container } = render(<LeavePlanner {...props([])} />);
    await user.click(cellOf(D2));
    await user.keyboard("f{Enter}");
    await act(async () => {});
    expect(textOf(D2)).toBe("vuota");
    expect(container.textContent).toContain("Salvataggio non riuscito");
    expect(container.textContent).toContain("Errore di salvataggio");
  });
});
