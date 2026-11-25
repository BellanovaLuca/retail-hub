// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoSaveTextarea } from "@/components/targets/auto-save-textarea";
import { useEntryAutosave, type EntryChange } from "@/components/targets/use-entry-autosave";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const D = "2026-11-25";

describe("useEntryAutosave", () => {
  it("errore di rete: stato «errore», numeri a schermo, e i salvataggi successivi ripartono", async () => {
    vi.useFakeTimers();
    let online = false;
    const calls: EntryChange[][] = [];
    const save = vi.fn(async (changes: EntryChange[]) => {
      calls.push(changes);
      if (!online) throw new TypeError("Failed to fetch");
      return { ok: true };
    });
    const { result } = renderHook(() => useEntryAutosave({}, save));

    act(() => result.current.update([{ kpiId: "wo", date: D, value: 3 }]));
    await tick(700);
    expect(calls).toHaveLength(1);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/connessione/);
    expect(result.current.get("wo", D)).toBe(3);

    // La rete torna: il tocco successivo porta con sé anche il lotto rimasto in coda.
    online = true;
    act(() => result.current.update([{ kpiId: "meta", date: D, value: 2 }]));
    await tick(700);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([
      { kpiId: "wo", date: D, value: 3 },
      { kpiId: "meta", date: D, value: 2 },
    ]);
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();

    // E dopo si continua a salvare normalmente.
    act(() => result.current.update([{ kpiId: "wo", date: D, value: 4 }]));
    await tick(700);
    expect(calls[2]).toEqual([{ kpiId: "wo", date: D, value: 4 }]);
  });

  it("errore di rete senza altri tocchi: riprova da solo", async () => {
    vi.useFakeTimers();
    let online = false;
    const save = vi.fn(async () => {
      if (!online) throw new Error("offline");
      return { ok: true };
    });
    const { result } = renderHook(() => useEntryAutosave({}, save));
    act(() => result.current.update([{ kpiId: "wo", date: D, value: 3 }]));
    await tick(700);
    expect(result.current.status).toBe("error");
    online = true;
    await tick(5100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("un tocco più recente sulla stessa cella non viene coperto dal lotto fallito", async () => {
    vi.useFakeTimers();
    let online = false;
    const calls: EntryChange[][] = [];
    const save = vi.fn(async (changes: EntryChange[]) => {
      calls.push(changes);
      if (!online) throw new Error("offline");
      return { ok: true };
    });
    const { result } = renderHook(() => useEntryAutosave({}, save));
    act(() => result.current.update([{ kpiId: "wo", date: D, value: 3 }]));
    await tick(700);
    online = true;
    act(() => result.current.update([{ kpiId: "wo", date: D, value: 5 }]));
    await tick(700);
    expect(calls[1]).toEqual([{ kpiId: "wo", date: D, value: 5 }]);
  });

  it("lotto rifiutato dal server (ok: false): i valori tornano a quelli salvati", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ ok: false, message: "Giorno non modificabile" }));
    const { result } = renderHook(() => useEntryAutosave({ [`wo|${D}`]: 1 }, save));
    act(() => result.current.update([{ kpiId: "wo", date: D, value: 3 }]));
    await tick(700);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Giorno non modificabile");
    expect(result.current.get("wo", D)).toBe(1);
    // Nessun nuovo tentativo automatico per un rifiuto.
    await tick(6000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("AutoSaveTextarea", () => {
  it("errore di rete: stato «errore» visibile e nuovo tentativo uscendo dal campo", async () => {
    vi.useFakeTimers();
    let online = false;
    const saved: string[] = [];
    render(
      <AutoSaveTextarea
        label="Nota"
        initialValue=""
        onSave={async (v) => {
          if (!online) throw new Error("offline");
          saved.push(v);
          return { ok: true };
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "ciao" } });
    await tick(1000);
    expect(screen.getByRole("status").textContent).toMatch(/Non salvato/);
    online = true;
    fireEvent.blur(screen.getByLabelText("Nota"));
    await tick(10);
    expect(saved).toEqual(["ciao"]);
    expect(screen.getByRole("status").textContent).toMatch(/Salvato/);
  });
});
