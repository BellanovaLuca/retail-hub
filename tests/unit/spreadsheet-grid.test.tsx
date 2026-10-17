// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SpreadsheetGrid } from "@/components/spreadsheet/spreadsheet-grid";
import type { CellChange, CellState, GridColumn, GridRow } from "@/components/spreadsheet/types";

// jsdom non calcola il layout: diamo al contenitore una dimensione perché il virtualizzatore
// renda le colonne.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1600,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 800,
  });
});

afterEach(cleanup);

const ROWS: GridRow[] = [
  { id: "anna", label: "Anna" },
  { id: "bruno", label: "Bruno" },
  { id: "carla", label: "Carla" },
];
const COLS: GridColumn[] = ["lun", "mar", "mer", "gio"].map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

type HarnessProps = {
  initial?: Record<string, string>;
  locked?: string[];
  onChange?: (changes: CellChange[]) => void;
  normalize?: (v: string) => { value: string } | { error: string };
  onCellActivate?: (rowId: string, colId: string) => void;
};

function Harness({ initial = {}, locked = [], onChange, normalize, onCellActivate }: HarnessProps) {
  const [data, setData] = React.useState(initial);
  const getValue = React.useCallback((r: string, c: string) => data[`${r}:${c}`] ?? "", [data]);
  const getCellState = React.useCallback(
    (r: string, c: string): CellState | undefined =>
      locked.includes(`${r}:${c}`) ? { readOnly: true, tone: "hatched" } : undefined,
    [locked],
  );
  return (
    <SpreadsheetGrid
      ariaLabel="Foglio di prova"
      rows={ROWS}
      columns={COLS}
      rowHeaderLabel="Persona"
      getValue={getValue}
      getCellState={getCellState}
      normalize={normalize}
      onCellActivate={onCellActivate}
      onChange={(changes) => {
        onChange?.(changes);
        setData((prev) => {
          const next = { ...prev };
          for (const ch of changes) next[`${ch.rowId}:${ch.colId}`] = ch.value;
          return next;
        });
      }}
    />
  );
}

const cell = (row: string, col: string) =>
  screen.getByRole("gridcell", { name: new RegExp(`^${row}, ${col}:`) });

const activeCell = () => document.activeElement as HTMLElement;

function setup(props: HarnessProps = {}) {
  const onChange = vi.fn<(changes: CellChange[]) => void>();
  const user = userEvent.setup();
  render(<Harness {...props} onChange={onChange} />);
  return { user, onChange };
}

/** Evento copy/cut/paste come lo genera il browser con Ctrl+C/X/V. */
function clipboardEvent(type: "copy" | "cut" | "paste", text = "") {
  const store: Record<string, string> = { "text/plain": text };
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", {
    value: {
      getData: (t: string) => store[t] ?? "",
      setData: (t: string, v: string) => {
        store[t] = v;
      },
    },
  });
  act(() => {
    activeCell().dispatchEvent(ev);
  });
  return { text: store["text/plain"], defaultPrevented: ev.defaultPrevented };
}

describe("SpreadsheetGrid · struttura e accessibilità", () => {
  it("espone grid, righe e celle con aria-label", () => {
    setup({ initial: { "anna:lun": "MAN" } });
    const grid = screen.getByRole("grid", { name: "Foglio di prova" });
    expect(grid.getAttribute("aria-colcount")).toBe("5");
    expect(grid.getAttribute("aria-rowcount")).toBe("4");
    expect(cell("Anna", "Lun").getAttribute("aria-label")).toBe("Anna, Lun: MAN");
    expect(cell("Anna", "Mar").getAttribute("aria-label")).toBe("Anna, Mar: vuota");
    // Roving tabindex: solo la cella attiva è nel ciclo del Tab.
    expect(cell("Anna", "Lun").tabIndex).toBe(0);
    expect(cell("Anna", "Mar").tabIndex).toBe(-1);
  });
});

describe("SpreadsheetGrid · tastiera", () => {
  it("frecce, Tab e Invio spostano la cella attiva", async () => {
    const { user } = setup();
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{ArrowRight}");
    expect(activeCell()).toBe(cell("Anna", "Mar"));
    await user.keyboard("{ArrowDown}");
    expect(activeCell()).toBe(cell("Bruno", "Mar"));
    await user.keyboard("{Tab}");
    expect(activeCell()).toBe(cell("Bruno", "Mer"));
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(activeCell()).toBe(cell("Bruno", "Mar"));
    await user.keyboard("{Enter}");
    expect(activeCell()).toBe(cell("Carla", "Mar"));
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(activeCell()).toBe(cell("Bruno", "Mar"));
    await user.keyboard("{End}");
    expect(activeCell()).toBe(cell("Bruno", "Gio"));
    await user.keyboard("{Home}");
    expect(activeCell()).toBe(cell("Bruno", "Lun"));
    expect(activeCell().getAttribute("aria-selected")).toBe("true");
  });

  it("digitazione diretta + Invio produce una onChange e scende", async () => {
    const { user, onChange } = setup({ initial: { "anna:lun": "vecchio" } });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("10-14{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ rowId: "anna", colId: "lun", value: "10-14" }]);
    expect(activeCell()).toBe(cell("Bruno", "Lun"));
    expect(cell("Anna", "Lun").getAttribute("aria-label")).toBe("Anna, Lun: 10-14");
  });

  it("F2 modifica mantenendo il valore, Esc annulla", async () => {
    const { user, onChange } = setup({ initial: { "anna:lun": "MAN" } });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{F2}");
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("MAN");
    await user.keyboard("X{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(activeCell()).toBe(cell("Anna", "Lun"));
  });

  it("Tab nell'editor conferma e va a destra", async () => {
    const { user, onChange } = setup();
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("R{Tab}");
    expect(onChange).toHaveBeenCalledWith([{ rowId: "anna", colId: "lun", value: "R" }]);
    expect(activeCell()).toBe(cell("Anna", "Mar"));
  });

  it("normalize: valore valido normalizzato, valore non valido non cambia la cella", async () => {
    const normalize = (v: string) =>
      /^[a-z]+$/i.test(v) ? { value: v.toUpperCase() } : { error: "Codice non valido" };
    const { user, onChange } = setup({ normalize });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("man{Enter}");
    expect(onChange).toHaveBeenLastCalledWith([{ rowId: "anna", colId: "lun", value: "MAN" }]);
    await user.keyboard("1?{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe("Codice non valido");
    await user.keyboard("{Escape}");
    expect(cell("Bruno", "Lun").getAttribute("aria-label")).toBe("Bruno, Lun: vuota");
  });

  it("Shift+frecce estende la selezione", async () => {
    const { user } = setup();
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{/Shift}");
    const selected = screen
      .getAllByRole("gridcell")
      .filter((el) => el.getAttribute("aria-selected") === "true")
      .map((el) => el.getAttribute("aria-label"));
    expect(selected).toEqual([
      "Anna, Lun: vuota",
      "Anna, Mar: vuota",
      "Bruno, Lun: vuota",
      "Bruno, Mar: vuota",
    ]);
    // La cella attiva resta quella di partenza.
    expect(activeCell()).toBe(cell("Anna", "Lun"));
  });

  it("Canc su un intervallo produce una sola onChange con tutte le celle (salta le readOnly)", async () => {
    const { user, onChange } = setup({
      initial: { "anna:lun": "A", "anna:mar": "B", "bruno:lun": "C", "bruno:mar": "D" },
      locked: ["bruno:mar"],
    });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{/Shift}{Delete}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { rowId: "anna", colId: "lun", value: "" },
      { rowId: "anna", colId: "mar", value: "" },
      { rowId: "bruno", colId: "lun", value: "" },
    ]);
  });

  it("Ctrl+A seleziona tutto", async () => {
    const { user } = setup();
    await user.click(cell("Bruno", "Mar"));
    await user.keyboard("{Control>}a{/Control}");
    const selected = screen
      .getAllByRole("gridcell")
      .filter((el) => el.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(12);
  });

  it("le celle readOnly non si modificano digitando", async () => {
    const { user, onChange } = setup({ locked: ["anna:lun"] });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("X");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("doppio clic chiama onCellActivate se presente, F2 edita comunque", async () => {
    const onCellActivate = vi.fn();
    const { user } = setup({ onCellActivate });
    await user.dblClick(cell("Carla", "Gio"));
    expect(onCellActivate).toHaveBeenCalledWith("carla", "gio");
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.keyboard("{Alt>}{Enter}{/Alt}");
    expect(onCellActivate).toHaveBeenCalledTimes(2);
    await user.keyboard("{F2}");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

describe("SpreadsheetGrid · appunti", () => {
  it("copy produce il TSV dell'intervallo", async () => {
    const { user } = setup({
      initial: { "anna:lun": "MAN", "anna:mar": "R", "bruno:lun": "10-14 16-20" },
    });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{/Shift}");
    const res = clipboardEvent("copy");
    expect(res.defaultPrevented).toBe(true);
    expect(res.text).toBe("MAN\tR\n10-14 16-20\t");
  });

  it("cut copia e svuota con una sola onChange", async () => {
    const { user, onChange } = setup({ initial: { "anna:lun": "MAN", "anna:mar": "R" } });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    const res = clipboardEvent("cut");
    expect(res.text).toBe("MAN\tR");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  it("paste di una matrice da Excel parte dalla cella attiva, taglia ai bordi e salta le readOnly", async () => {
    const { user, onChange } = setup({ locked: ["bruno:gio"] });
    await user.click(cell("Anna", "Mer"));
    await user.keyboard("{ArrowDown}");
    clipboardEvent("paste", "A\tB\tC\r\nD\tE\tF\r\nG\tH\tI\r\n");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { rowId: "bruno", colId: "mer", value: "A" },
      { rowId: "carla", colId: "mer", value: "D" },
      { rowId: "carla", colId: "gio", value: "E" },
    ]);
  });

  it("paste di un valore singolo su un intervallo lo ripete ovunque", async () => {
    const { user, onChange } = setup({ locked: ["anna:mar"] });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{/Shift}");
    clipboardEvent("paste", "F\r\n");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { rowId: "anna", colId: "lun", value: "F" },
      { rowId: "bruno", colId: "lun", value: "F" },
      { rowId: "bruno", colId: "mar", value: "F" },
    ]);
  });

  it("paste applica normalize e ignora i valori non validi", async () => {
    const normalize = (v: string) =>
      v === "x" ? { error: "Non valido" } : { value: v.toUpperCase() };
    const { user, onChange } = setup({ normalize });
    await user.click(cell("Anna", "Lun"));
    clipboardEvent("paste", "man\tx\tr");
    expect(onChange.mock.calls[0][0]).toEqual([
      { rowId: "anna", colId: "lun", value: "MAN" },
      { rowId: "anna", colId: "mer", value: "R" },
    ]);
    expect(screen.getByRole("status").textContent).toBe("Non valido");
  });
});

describe("SpreadsheetGrid · riempimento e annulla", () => {
  it("Ctrl+D riempie in basso con una sola onChange", async () => {
    const { user, onChange } = setup({ initial: { "anna:lun": "MAN", "anna:mar": "R" } });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{ArrowDown}{/Shift}");
    await user.keyboard("{Control>}d{/Control}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { rowId: "bruno", colId: "lun", value: "MAN" },
      { rowId: "bruno", colId: "mar", value: "R" },
      { rowId: "carla", colId: "lun", value: "MAN" },
      { rowId: "carla", colId: "mar", value: "R" },
    ]);
  });

  it("Ctrl+R riempie a destra", async () => {
    const { user, onChange } = setup({ initial: { "anna:lun": "F" } });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}{Control>}r{/Control}");
    expect(onChange.mock.calls[0][0]).toEqual([
      { rowId: "anna", colId: "mar", value: "F" },
      { rowId: "anna", colId: "mer", value: "F" },
    ]);
  });

  it("Ctrl+Z annulla e Ctrl+Y / Ctrl+Shift+Z ripetono, sempre tramite onChange", async () => {
    const { user, onChange } = setup({ initial: { "anna:lun": "A", "bruno:lun": "B" } });
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}{Delete}");
    expect(cell("Anna", "Lun").getAttribute("aria-label")).toBe("Anna, Lun: vuota");

    await user.keyboard("{Control>}z{/Control}");
    expect(onChange).toHaveBeenLastCalledWith([
      { rowId: "anna", colId: "lun", value: "A" },
      { rowId: "bruno", colId: "lun", value: "B" },
    ]);
    expect(cell("Bruno", "Lun").getAttribute("aria-label")).toBe("Bruno, Lun: B");

    await user.keyboard("{Control>}y{/Control}");
    expect(onChange).toHaveBeenLastCalledWith([
      { rowId: "anna", colId: "lun", value: "" },
      { rowId: "bruno", colId: "lun", value: "" },
    ]);

    await user.keyboard("{Control>}z{/Control}{Control>}{Shift>}z{/Shift}{/Control}");
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(cell("Anna", "Lun").getAttribute("aria-label")).toBe("Anna, Lun: vuota");

    // Una nuova modifica svuota lo stack di ripetizione.
    await user.keyboard("{Control>}z{/Control}X{Enter}{Control>}y{/Control}");
    expect(onChange).toHaveBeenCalledTimes(7);
  });
});

describe("SpreadsheetGrid · sola lettura", () => {
  it("senza onChange non si edita né si incolla, ma si copia", async () => {
    const user = userEvent.setup();
    render(
      <SpreadsheetGrid
        ariaLabel="Ferie"
        rows={ROWS}
        columns={COLS}
        getValue={(r, c) => (r === "anna" && c === "lun" ? "F" : "")}
      />,
    );
    expect(screen.getByRole("grid").getAttribute("aria-readonly")).toBe("true");
    await user.click(cell("Anna", "Lun"));
    await user.keyboard("X");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(clipboardEvent("copy").text).toBe("F");
  });
});

describe("SpreadsheetGrid · virtualizzazione", () => {
  it("con 366 colonne rende solo quelle visibili ma tiene nel DOM la cella attiva", async () => {
    const user = userEvent.setup();
    const days: GridColumn[] = Array.from({ length: 366 }, (_, i) => ({
      id: `d${i}`,
      label: `G${i + 1}`,
      width: 36,
    }));
    render(
      <SpreadsheetGrid
        ariaLabel="Ferie anno"
        rows={ROWS}
        columns={days}
        getValue={() => ""}
        onChange={() => {}}
      />,
    );
    const rendered = () => screen.getAllByRole("gridcell").length / ROWS.length;
    expect(rendered()).toBeLessThan(100);
    await user.click(cell("Anna", "G1"));
    await user.keyboard("{End}");
    expect(activeCell()).toBe(cell("Anna", "G366"));
    await user.keyboard("{Control>}{Home}{/Control}");
    expect(activeCell()).toBe(cell("Anna", "G1"));
  });
});
