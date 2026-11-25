// @vitest-environment jsdom
/**
 * Foglio orario: le ore dipinte da tastiera aspettano un attimo prima di essere salvate. In
 * quell'attesa non devono andare perse né se arrivano dati nuovi dal server (il ricarico dopo un
 * altro salvataggio, un collega che modifica), né se il foglio viene smontato (cambio vista).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Timesheet, type TimesheetSaveInput } from "@/components/schedule/timesheet";
import type { SchedulePerson, ShiftRecord } from "@/lib/schedule/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DAYS = Array.from({ length: 7 }, (_, i) => `2026-10-${String(19 + i).padStart(2, "0")}`);
const person = (
  id: string,
  displayName: string,
  homeZone: SchedulePerson["homeZone"],
): SchedulePerson => ({
  id,
  displayName,
  shortLabel: displayName.toUpperCase(),
  color: null,
  homeZone,
  weeklyHours: 40,
  countsForCoverage: true,
  primaryDepartmentId: "d-ott",
  departmentIds: ["d-ott"],
});
const PEOPLE = [person("p-giu", "Giulia", "sole"), person("p-fra", "Francy", "vista")];
const shift = (id: string, profileId: string, start: string, end: string): ShiftRecord => ({
  id,
  profileId,
  date: DAYS[0],
  templateId: null,
  start,
  end,
  breakMinutes: 0,
  departmentId: null,
  zone: null,
  isBackOffice: null,
  note: null,
  conflict: false,
});
const CALENDAR = {
  openingHours: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), { open: "10:00", close: "20:00" }]),
  ),
  exceptions: {},
  holidays: [],
};

type Save = (input: TimesheetSaveInput) => Promise<{ ok: boolean }>;

function sheet(shifts: ShiftRecord[], onSaveDay: Save) {
  return (
    <Timesheet
      weekId="w1"
      weekNumber={43}
      days={DAYS}
      today={DAYS[0]}
      shifts={shifts}
      leaves={[]}
      people={PEOPLE}
      departments={[{ id: "d-ott", name: "Ottici" }]}
      calendar={CALENDAR}
      onSaveDay={onSaveDay}
    />
  );
}

describe("Timesheet · pittura da tastiera in attesa di salvataggio", () => {
  it("dati nuovi dal server durante l'attesa non cancellano le ore appena scritte", async () => {
    vi.useFakeTimers();
    const onSaveDay = vi.fn<Save>(async () => ({ ok: true }));
    const { rerender } = render(sheet([shift("s1", "p-fra", "10:00", "12:00")], onSaveDay));
    const cell = screen.getByLabelText("Giulia, lun 19, 14:00–14:30: vuoto");
    cell.focus();
    fireEvent.keyDown(cell, { key: "1" });
    expect(screen.getByLabelText("Giulia, lun 19, 14:00–14:30: presente")).toBeTruthy();

    // Dopo 300 ms arriva un ricarico (stessi turni, array nuovo): il timer è ancora pendente.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    rerender(sheet([shift("s1", "p-fra", "10:00", "12:00")], onSaveDay));
    expect(screen.getByLabelText("Giulia, lun 19, 14:00–14:30: presente")).toBeTruthy();
    expect(onSaveDay).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(onSaveDay).toHaveBeenCalledTimes(1);
    expect(onSaveDay.mock.calls[0][0]).toMatchObject({
      profileId: "p-giu",
      date: DAYS[0],
      segments: [{ start: "14:00", end: "15:00", isBackOffice: null }],
    });
  });

  it("i turni di partenza sono quelli arrivati nel frattempo dal server", async () => {
    vi.useFakeTimers();
    const onSaveDay = vi.fn<Save>(async () => ({ ok: true }));
    const { rerender } = render(sheet([], onSaveDay));
    const cell = screen.getByLabelText("Giulia, lun 19, 14:00–14:30: vuoto");
    cell.focus();
    fireEvent.keyDown(cell, { key: "1" });
    // Un collega ha appena salvato per Giulia 10:15–12:00: resta, con il suo quarto d'ora.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender(sheet([shift("s9", "p-giu", "10:15", "12:00")], onSaveDay));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(onSaveDay).toHaveBeenCalledTimes(1);
    const { segments } = onSaveDay.mock.calls[0][0];
    expect(segments).toContainEqual({ start: "14:00", end: "15:00", isBackOffice: null });
  });

  it("dopo il salvataggio i dati del server sostituiscono la pittura", async () => {
    vi.useFakeTimers();
    const onSaveDay = vi.fn<Save>(async () => ({ ok: true }));
    const { rerender } = render(sheet([], onSaveDay));
    const cell = screen.getByLabelText("Giulia, lun 19, 14:00–14:30: vuoto");
    cell.focus();
    fireEvent.keyDown(cell, { key: "1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(onSaveDay).toHaveBeenCalledTimes(1);
    // Il server ha salvato (qui: niente, per vedere che la pittura non resta appesa).
    rerender(sheet([], onSaveDay));
    expect(screen.getByLabelText("Giulia, lun 19, 14:00–14:30: vuoto")).toBeTruthy();
  });

  it("smontando il foglio durante l'attesa la giornata viene salvata subito", async () => {
    vi.useFakeTimers();
    const onSaveDay = vi.fn<Save>(async () => ({ ok: true }));
    const { unmount } = render(sheet([], onSaveDay));
    const cell = screen.getByLabelText("Giulia, lun 19, 14:00–14:30: vuoto");
    cell.focus();
    fireEvent.keyDown(cell, { key: "1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(onSaveDay).not.toHaveBeenCalled();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onSaveDay).toHaveBeenCalledTimes(1);
    expect(onSaveDay.mock.calls[0][0]).toMatchObject({
      profileId: "p-giu",
      segments: [{ start: "14:00", end: "15:00", isBackOffice: null }],
    });
    // Il timer non riparte una seconda volta.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onSaveDay).toHaveBeenCalledTimes(1);
  });

  it("con una giornata in attesa la chiusura della pagina chiede conferma", async () => {
    vi.useFakeTimers();
    const onSaveDay = vi.fn<Save>(async () => ({ ok: true }));
    render(sheet([], onSaveDay));
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    const cell = screen.getByLabelText("Giulia, lun 19, 14:00–14:30: vuoto");
    cell.focus();
    fireEvent.keyDown(cell, { key: "1" });
    expect(leave()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(leave()).toBe(false);
  });
});
