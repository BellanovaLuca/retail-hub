// @vitest-environment jsdom
/**
 * Foglio orario dell'admin nei giorni di assenza (richiesta del 27/11/2026): la colonna resta
 * segnata ma ci si può dipingere sopra, e la giornata viene salvata come le altre.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Timesheet, type TimesheetSaveInput } from "@/components/schedule/timesheet";
import type { LeaveRecord, SchedulePerson } from "@/lib/schedule/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DAYS = Array.from({ length: 7 }, (_, i) => `2026-10-${String(19 + i).padStart(2, "0")}`);
const GIULIA: SchedulePerson = {
  id: "p-giu",
  displayName: "Giulia",
  shortLabel: "GIULIA",
  color: null,
  homeZone: "sole",
  weeklyHours: 40,
  countsForCoverage: true,
  primaryDepartmentId: "d-ott",
  departmentIds: ["d-ott"],
};
const FERIE: LeaveRecord = {
  profileId: "p-giu",
  date: DAYS[1],
  type: "ferie",
  hours: null,
  status: "confirmed",
  source: "request",
  requestId: "req-1",
};
const CALENDAR = {
  openingHours: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), { open: "10:00", close: "20:00" }]),
  ),
  exceptions: {},
  holidays: [],
};

function setup(readOnly = false) {
  const onSaveDay = vi.fn<(input: TimesheetSaveInput) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  }));
  render(
    <Timesheet
      weekId="w1"
      weekNumber={43}
      days={DAYS}
      today={DAYS[0]}
      shifts={[]}
      leaves={[FERIE]}
      people={[GIULIA]}
      departments={[{ id: "d-ott", name: "Ottici" }]}
      calendar={CALENDAR}
      readOnly={readOnly}
      onSaveDay={onSaveDay}
    />,
  );
  return onSaveDay;
}

describe("Timesheet nei giorni di assenza", () => {
  it("la colonna dice che c'è l'assenza ma non è bloccata", () => {
    setup();
    const cell = screen.getByLabelText(
      "Giulia, mar 20, 10:00–10:30: vuoto (Ferie · richiesta approvata)",
    );
    expect(cell.getAttribute("aria-disabled")).toBeNull();
    expect(cell.className).not.toContain("cursor-not-allowed");
  });

  it("si dipinge sopra l'assenza e la giornata viene salvata", async () => {
    vi.useFakeTimers();
    const save = setup();
    const cell = screen.getByLabelText(
      "Giulia, mar 20, 10:00–10:30: vuoto (Ferie · richiesta approvata)",
    );
    cell.focus();
    fireEvent.keyDown(cell, { key: "1" });
    expect(
      screen.getByLabelText("Giulia, mar 20, 10:00–10:30: presente (Ferie · richiesta approvata)"),
    ).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      profileId: "p-giu",
      date: DAYS[1],
      segments: [{ start: "10:00", end: "11:00" }],
    });
  });

  it("in sola lettura (vista dei dipendenti) non si dipinge comunque", async () => {
    vi.useFakeTimers();
    const save = setup(true);
    const cell = screen.getByLabelText(
      "Giulia, mar 20, 10:00–10:30: vuoto (Ferie · richiesta approvata)",
    );
    expect(cell.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(cell, { key: "1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save).not.toHaveBeenCalled();
  });
});
