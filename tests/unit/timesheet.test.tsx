// @vitest-environment jsdom
/**
 * Foglio orario (§8.1): etichette accessibili, assenze bloccate, salvataggio da tastiera.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Timesheet, type TimesheetSaveInput } from "@/components/schedule/timesheet";
import type { LeaveRecord, SchedulePerson, ShiftRecord } from "@/lib/schedule/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DAYS = Array.from({ length: 7 }, (_, i) => `2026-10-${String(19 + i).padStart(2, "0")}`);
const person = (
  id: string,
  displayName: string,
  homeZone: SchedulePerson["homeZone"],
  countsForCoverage = true,
): SchedulePerson => ({
  id,
  displayName,
  shortLabel: displayName.toUpperCase(),
  color: null,
  homeZone,
  weeklyHours: 40,
  countsForCoverage,
  primaryDepartmentId: "d-ott",
  departmentIds: ["d-ott"],
});
const PEOPLE = [
  person("p-giu", "Giulia", "sole"),
  person("p-fra", "Francy", "vista"),
  person("p-mar", "Marco", "jolly"),
];
const SHIFTS: ShiftRecord[] = [
  {
    id: "s1",
    profileId: "p-fra",
    date: DAYS[0],
    templateId: null,
    start: "10:00",
    end: "12:00",
    breakMinutes: 0,
    departmentId: null,
    zone: null,
    isBackOffice: null,
    note: "vetrine",
    conflict: false,
  },
];
const LEAVES: LeaveRecord[] = [
  {
    profileId: "p-giu",
    date: DAYS[1],
    type: "ferie",
    hours: null,
    status: "confirmed",
    source: "planning",
  },
];
const CALENDAR = {
  openingHours: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), { open: "10:00", close: "20:00" }]),
  ),
  exceptions: {},
  holidays: [],
};

function setup(
  onSaveDay = vi.fn<(input: TimesheetSaveInput) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  })),
) {
  render(
    <Timesheet
      weekId="w1"
      weekNumber={43}
      days={DAYS}
      today={DAYS[0]}
      shifts={SHIFTS}
      leaves={LEAVES}
      pendingRequests={[{ profileId: "p-fra", date: DAYS[2] }]}
      people={PEOPLE}
      departments={[{ id: "d-ott", name: "Ottici" }]}
      calendar={CALENDAR}
      onSaveDay={onSaveDay}
    />,
  );
  return onSaveDay;
}

describe("Timesheet", () => {
  it("colonne Vista → Sole → Jolly e mezze celle con aria-label", () => {
    setup();
    const firstDay = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(firstDay.indexOf("FRANCY")).toBeLessThan(firstDay.indexOf("GIULIA"));
    expect(firstDay.indexOf("GIULIA")).toBeLessThan(firstDay.indexOf("MARCO"));
    expect(screen.getByLabelText("Francy, lun 19, 10:00–10:30: presente")).toBeTruthy();
    expect(screen.getByLabelText("Francy, lun 19, 12:00–12:30: vuoto")).toBeTruthy();
    // Ferie: celle bloccate.
    const ferie = screen.getByLabelText("Giulia, mar 20, 10:00–10:30: vuoto (Ferie)");
    expect(ferie.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByLabelText(/^Francy, mer 21, 10:00–10:30: vuoto \(Richiesta in attesa\)/),
    ).toBeTruthy();
  });

  it("da tastiera: 1 = ora piena, salva la giornata mantenendo la nota", async () => {
    vi.useFakeTimers();
    const save = setup();
    const cell = screen.getByLabelText("Francy, lun 19, 12:00–12:30: vuoto");
    cell.focus();
    fireEvent.keyDown(cell, { key: "1" });
    // Anteprima immediata, salvataggio dopo una breve pausa.
    expect(screen.getByLabelText("Francy, lun 19, 12:30–13:00: presente")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({
      weekId: "w1",
      profileId: "p-fra",
      date: DAYS[0],
      templateId: null,
      segments: [{ start: "10:00", end: "13:00", isBackOffice: null }],
      breakMinutes: 0,
      departmentId: null,
      zone: null,
      note: "vetrine",
    });
    // Il fuoco scende all'ora successiva.
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Francy, lun 19, 13:00–13:30: vuoto",
    );
  });

  it("b sul turno lo passa in back office; per i jolly chiede l'area", async () => {
    vi.useFakeTimers();
    const save = setup();
    const cell = screen.getByLabelText("Francy, lun 19, 10:00–10:30: presente");
    fireEvent.keyDown(cell, { key: "b" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save.mock.calls[0][0].segments).toEqual([
      { start: "10:00", end: "11:00", isBackOffice: true },
      { start: "11:00", end: "12:00", isBackOffice: null },
    ]);

    fireEvent.keyDown(screen.getByLabelText("Marco, gio 22, 10:00–10:30: vuoto"), { key: "1" });
    expect(screen.getByText("In quale area?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sole" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(save.mock.calls[1][0]).toMatchObject({
      profileId: "p-mar",
      date: DAYS[3],
      zone: "sole",
      segments: [{ start: "10:00", end: "11:00", isBackOffice: null }],
    });
  });

  it("in sola lettura non salva nulla", () => {
    const save = vi.fn(async () => ({ ok: true }));
    render(
      <Timesheet
        weekId="w1"
        weekNumber={43}
        days={DAYS}
        today={DAYS[0]}
        shifts={SHIFTS}
        leaves={[]}
        people={PEOPLE}
        departments={[]}
        calendar={CALENDAR}
        readOnly
        onSaveDay={save}
      />,
    );
    const cell = screen.getByLabelText("Francy, lun 19, 12:00–12:30: vuoto");
    fireEvent.keyDown(cell, { key: "1" });
    expect(screen.getByLabelText("Francy, lun 19, 12:00–12:30: vuoto")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});
