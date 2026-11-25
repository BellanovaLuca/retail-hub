import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCellSaveQueue,
  FLUSH_DELAY_MS,
  RETRY_DELAY_MS,
  UNREACHABLE_MESSAGE,
  type QueuedCell,
} from "@/app/admin/turni/[week]/cell-save-queue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const cell = (profileId: string, value: string, date = "2026-11-23"): QueuedCell => ({
  profileId,
  date,
  value,
});

function setup(save: (batch: QueuedCell[]) => Promise<{ ok: boolean; message?: string }>) {
  const states: [string, string | null][] = [];
  const onSettled = vi.fn();
  const spy = vi.fn(save);
  const queue = createCellSaveQueue(() => ({
    save: spy,
    onState: (state, message) => states.push([state, message]),
    onSettled,
  }));
  return { queue, save: spy, states, onSettled };
}

describe("coda di salvataggio del foglio turni", () => {
  it("più celle scritte di fila partono in un solo lotto; poi si ricaricano i dati", async () => {
    const { queue, save, states, onSettled } = setup(async () => ({ ok: true }));
    queue.enqueue([cell("anna", "10-14")]);
    queue.enqueue([cell("bruno", "R"), cell("anna", "10-18")]);
    expect(queue.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 10);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual([cell("anna", "10-18"), cell("bruno", "R")]);
    expect(states.at(-1)).toEqual(["saved", null]);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(queue.busy()).toBe(false);
  });

  it("server non raggiungibile: le celle restano in coda, errore visibile, poi si riprova", async () => {
    let online = false;
    const { queue, save, states, onSettled } = setup(async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return { ok: true };
    });
    queue.enqueue([cell("anna", "10-14"), cell("bruno", "R")]);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 10);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual(["error", UNREACHABLE_MESSAGE]);
    // Niente ricaricamento (toglierebbe dal foglio le celle scritte) e la coda resta piena.
    expect(onSettled).not.toHaveBeenCalled();
    expect(queue.busy()).toBe(true);

    // Nel frattempo Anna viene riscritta: il nuovo valore non è coperto da quello fallito.
    queue.enqueue([cell("anna", "10-20")]);
    online = true;
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 10);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual([cell("anna", "10-20"), cell("bruno", "R")]);
    expect(states.at(-1)).toEqual(["saved", null]);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(queue.busy()).toBe(false);
  });

  it("senza altre modifiche il lotto fallito viene riprovato da solo", async () => {
    let online = false;
    const { queue, save, onSettled } = setup(async () => {
      if (!online) throw new Error("offline");
      return { ok: true };
    });
    queue.enqueue([cell("anna", "10-14")]);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 10);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 10);
    expect(save).toHaveBeenCalledTimes(2); // ancora offline
    online = true;
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 10);
    expect(save).toHaveBeenCalledTimes(3);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("celle rifiutate dal server (ok: false): messaggio e ricaricamento, senza riprovare", async () => {
    const { queue, save, states, onSettled } = setup(async () => ({
      ok: false,
      message: "1 celle non valide",
    }));
    queue.enqueue([cell("anna", "boh")]);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 10);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual(["error", "1 celle non valide"]);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(queue.busy()).toBe(false);
  });

  it("un lotto alla volta: ciò che si scrive durante un salvataggio parte subito dopo", async () => {
    const pending: (() => void)[] = [];
    const { queue, save, onSettled } = setup(
      () => new Promise((resolve) => pending.push(() => resolve({ ok: true }))),
    );
    queue.enqueue([cell("anna", "10-14")]);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 10);
    queue.enqueue([cell("bruno", "R")]);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 10);
    expect(save).toHaveBeenCalledTimes(1);
    pending[0]();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(onSettled).not.toHaveBeenCalled();
    pending[1]();
    await vi.advanceTimersByTimeAsync(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("smontando l'editor la coda parte subito", async () => {
    const { queue, save } = setup(async () => ({ ok: true }));
    queue.enqueue([cell("anna", "10-14")]);
    queue.dispose();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
