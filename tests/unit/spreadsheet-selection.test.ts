import { describe, expect, it } from "vitest";
import {
  type Selection,
  cellsIn,
  extendTo,
  fillShortcutWrites,
  fillTarget,
  fillWrites,
  move,
  moveToEdge,
  pasteWrites,
  readRect,
  rectOf,
  selectAll,
  single,
} from "@/components/spreadsheet/selection";

const B = { rows: 5, cols: 7 };
const sel = (ar: number, ac: number, fr = ar, fc = ac): Selection => ({
  anchor: { r: ar, c: ac },
  focus: { r: fr, c: fc },
});

describe("movimento", () => {
  it("le frecce spostano la cella attiva restando nei limiti", () => {
    expect(move(single({ r: 2, c: 3 }), "right", B)).toEqual(sel(2, 4));
    expect(move(single({ r: 0, c: 0 }), "up", B)).toEqual(sel(0, 0));
    expect(move(single({ r: 4, c: 6 }), "down", B)).toEqual(sel(4, 6));
    expect(move(single({ r: 4, c: 6 }), "right", B)).toEqual(sel(4, 6));
  });

  it("una freccia senza Shift riduce l'intervallo a una cella", () => {
    expect(move(sel(1, 1, 3, 3), "left", B)).toEqual(sel(1, 0));
  });

  it("Shift+freccia estende dall'estremo opposto lasciando ferma la cella attiva", () => {
    const a = move(single({ r: 1, c: 1 }), "right", B, { extend: true });
    expect(a).toEqual(sel(1, 1, 1, 2));
    const b = move(a, "down", B, { extend: true });
    expect(b).toEqual(sel(1, 1, 2, 2));
    expect(rectOf(b)).toEqual({ r1: 1, c1: 1, r2: 2, c2: 2 });
    // Tornando indietro l'intervallo si restringe.
    expect(move(b, "up", B, { extend: true })).toEqual(sel(1, 1, 1, 2));
  });

  it("Ctrl+freccia salta al bordo", () => {
    expect(move(single({ r: 2, c: 3 }), "right", B, { jump: true })).toEqual(sel(2, 6));
    expect(move(single({ r: 2, c: 3 }), "up", B, { jump: true })).toEqual(sel(0, 3));
  });

  it("PagGiù sposta di più righe", () => {
    expect(move(single({ r: 0, c: 0 }), "down", B, { step: 10 })).toEqual(sel(4, 0));
  });

  it("Home/End e Ctrl+Home/End", () => {
    expect(moveToEdge(single({ r: 2, c: 3 }), "home", B)).toEqual(sel(2, 0));
    expect(moveToEdge(single({ r: 2, c: 3 }), "end", B)).toEqual(sel(2, 6));
    expect(moveToEdge(single({ r: 2, c: 3 }), "end", B, { ctrl: true })).toEqual(sel(4, 6));
    expect(moveToEdge(single({ r: 2, c: 3 }), "home", B, { extend: true })).toEqual(
      sel(2, 3, 2, 0),
    );
  });

  it("Ctrl+A seleziona tutto, Shift+clic estende", () => {
    expect(selectAll(B)).toEqual(sel(0, 0, 4, 6));
    expect(extendTo(single({ r: 3, c: 3 }), { r: 1, c: 0 })).toEqual(sel(3, 3, 1, 0));
    expect(rectOf(sel(3, 3, 1, 0))).toEqual({ r1: 1, c1: 0, r2: 3, c2: 3 });
  });

  it("cellsIn elenca le celle riga per riga", () => {
    expect(cellsIn({ r1: 0, c1: 0, r2: 1, c2: 1 })).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ]);
  });
});

describe("incolla", () => {
  it("una matrice parte dalla cella attiva e si taglia ai bordi", () => {
    const w = pasteWrites(
      [
        ["a", "b", "c"],
        ["d", "e", "f"],
      ],
      single({ r: 4, c: 5 }),
      B,
    );
    expect(w).toEqual([
      { r: 4, c: 5, value: "a" },
      { r: 4, c: 6, value: "b" },
    ]);
  });

  it("un valore singolo si ripete su tutto l'intervallo", () => {
    const w = pasteWrites([["F"]], sel(0, 0, 1, 2), B);
    expect(w).toHaveLength(6);
    expect(w.every((x) => x.value === "F")).toBe(true);
  });

  it("su un intervallo multiplo della matrice la ripete, come Excel", () => {
    const w = pasteWrites([["a", "b"]], sel(0, 0, 1, 3), B);
    expect(w.map((x) => x.value)).toEqual(["a", "b", "a", "b", "a", "b", "a", "b"]);
  });

  it("righe di lunghezza diversa: le celle mancanti diventano vuote", () => {
    const w = pasteWrites([["a", "b"], ["c"]], single({ r: 0, c: 0 }), B);
    expect(w).toContainEqual({ r: 1, c: 1, value: "" });
  });
});

describe("riempimento", () => {
  const grid = [
    ["A", "B", "", "", ""],
    ["C", "D", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
  ];
  const read = (r: number, c: number) => grid[r][c];

  it("la maniglia sceglie l'asse con lo spostamento maggiore", () => {
    const src = { r1: 0, c1: 0, r2: 1, c2: 1 };
    expect(fillTarget(src, { r: 3, c: 2 })).toEqual({ r1: 0, c1: 0, r2: 3, c2: 1 });
    expect(fillTarget(src, { r: 1, c: 4 })).toEqual({ r1: 0, c1: 0, r2: 1, c2: 4 });
    expect(fillTarget(src, { r: 1, c: 1 })).toBeNull();
  });

  it("ripete i valori della sorgente sulle celle nuove", () => {
    const src = { r1: 0, c1: 0, r2: 1, c2: 1 };
    const w = fillWrites(src, { r1: 0, c1: 0, r2: 3, c2: 1 }, read);
    expect(w).toEqual([
      { r: 2, c: 0, value: "A" },
      { r: 2, c: 1, value: "B" },
      { r: 3, c: 0, value: "C" },
      { r: 3, c: 1, value: "D" },
    ]);
  });

  it("riempie anche verso l'alto/sinistra mantenendo l'allineamento", () => {
    const g = [["", "", "X", "Y"]];
    const w = fillWrites(
      { r1: 0, c1: 2, r2: 0, c2: 3 },
      { r1: 0, c1: 0, r2: 0, c2: 3 },
      (r, c) => g[r][c],
    );
    expect(w).toEqual([
      { r: 0, c: 0, value: "X" },
      { r: 0, c: 1, value: "Y" },
    ]);
  });

  it("Ctrl+D copia la prima riga sulle altre; con una riga sola copia quella sopra", () => {
    expect(fillShortcutWrites(sel(0, 0, 2, 1), "down", read)).toEqual([
      { r: 1, c: 0, value: "A" },
      { r: 1, c: 1, value: "B" },
      { r: 2, c: 0, value: "A" },
      { r: 2, c: 1, value: "B" },
    ]);
    expect(fillShortcutWrites(single({ r: 2, c: 1 }), "down", read)).toEqual([
      { r: 2, c: 1, value: "D" },
    ]);
    expect(fillShortcutWrites(single({ r: 0, c: 0 }), "down", read)).toEqual([]);
  });

  it("Ctrl+R copia la prima colonna verso destra", () => {
    expect(fillShortcutWrites(sel(0, 0, 1, 2), "right", read)).toEqual([
      { r: 0, c: 1, value: "A" },
      { r: 0, c: 2, value: "A" },
      { r: 1, c: 1, value: "C" },
      { r: 1, c: 2, value: "C" },
    ]);
  });

  it("readRect legge la matrice dell'intervallo", () => {
    expect(readRect({ r1: 0, c1: 0, r2: 1, c2: 1 }, read)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });
});
