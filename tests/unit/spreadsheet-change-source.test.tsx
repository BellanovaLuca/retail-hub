// @vitest-environment jsdom
/**
 * La griglia dice a `onChange` da dove arriva il lotto: modifica dell'utente, Annulla o Ripeti.
 * Il foglio turni lo usa per ripristinare, con Annulla, anche quello che la cella non mostra.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SpreadsheetGrid } from "@/components/spreadsheet/spreadsheet-grid";
import type { CellChange, ChangeMeta, GridColumn, GridRow } from "@/components/spreadsheet/types";

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

const ROWS: GridRow[] = [{ id: "anna", label: "Anna" }];
const COLS: GridColumn[] = [
  { id: "lun", label: "Lun" },
  { id: "mar", label: "Mar" },
];

function Harness({ onChange }: { onChange: (c: CellChange[], meta: ChangeMeta) => void }) {
  const [data, setData] = React.useState<Record<string, string>>({ "anna:lun": "10–19" });
  const getValue = React.useCallback((r: string, c: string) => data[`${r}:${c}`] ?? "", [data]);
  return (
    <SpreadsheetGrid
      ariaLabel="Foglio di prova"
      rows={ROWS}
      columns={COLS}
      rowHeaderLabel="Persona"
      getValue={getValue}
      onChange={(changes, meta) => {
        onChange(changes, meta);
        setData((prev) => {
          const next = { ...prev };
          for (const ch of changes) next[`${ch.rowId}:${ch.colId}`] = ch.value;
          return next;
        });
      }}
    />
  );
}

describe("SpreadsheetGrid · origine delle modifiche", () => {
  it("Canc è una modifica; Ctrl+Z e Ctrl+Y arrivano come annulla e ripeti", async () => {
    const onChange = vi.fn<(c: CellChange[], meta: ChangeMeta) => void>();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("gridcell", { name: /^Anna, Lun:/ }));

    await user.keyboard("{Delete}");
    expect(onChange).toHaveBeenLastCalledWith([{ rowId: "anna", colId: "lun", value: "" }], {
      source: "edit",
    });
    await user.keyboard("{Control>}z{/Control}");
    expect(onChange).toHaveBeenLastCalledWith([{ rowId: "anna", colId: "lun", value: "10–19" }], {
      source: "undo",
    });
    await user.keyboard("{Control>}y{/Control}");
    expect(onChange).toHaveBeenLastCalledWith([{ rowId: "anna", colId: "lun", value: "" }], {
      source: "redo",
    });
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
