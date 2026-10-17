/**
 * Logica pura di selezione per `SpreadsheetGrid`: posizioni, intervalli, movimento,
 * incolla e riempimento. Nessuna dipendenza da React o dal DOM, così si testa in node.
 *
 * Coordinate: `r` = indice di riga (tra le righe visibili), `c` = indice di colonna.
 */

export type Pos = { r: number; c: number };

/** `anchor` è la cella attiva (quella che si edita), `focus` l'estremo opposto dell'intervallo. */
export type Selection = { anchor: Pos; focus: Pos };

/** Rettangolo normalizzato: r1 ≤ r2, c1 ≤ c2 (estremi inclusi). */
export type Rect = { r1: number; c1: number; r2: number; c2: number };

export type Bounds = { rows: number; cols: number };

export type Direction = "up" | "down" | "left" | "right";

/** Una modifica espressa in coordinate di griglia. */
export type CellWrite = { r: number; c: number; value: string };

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export function clampPos(p: Pos, b: Bounds): Pos {
  return { r: clamp(p.r, 0, Math.max(0, b.rows - 1)), c: clamp(p.c, 0, Math.max(0, b.cols - 1)) };
}

export function single(p: Pos): Selection {
  return { anchor: p, focus: p };
}

export function rectOf(sel: Selection): Rect {
  return {
    r1: Math.min(sel.anchor.r, sel.focus.r),
    r2: Math.max(sel.anchor.r, sel.focus.r),
    c1: Math.min(sel.anchor.c, sel.focus.c),
    c2: Math.max(sel.anchor.c, sel.focus.c),
  };
}

export function rectContains(rect: Rect, r: number, c: number): boolean {
  return r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;
}

export function rectSize(rect: Rect): { rows: number; cols: number } {
  return { rows: rect.r2 - rect.r1 + 1, cols: rect.c2 - rect.c1 + 1 };
}

export function isSingleCell(sel: Selection): boolean {
  return sel.anchor.r === sel.focus.r && sel.anchor.c === sel.focus.c;
}

/** Tutte le celle del rettangolo, riga per riga. */
export function cellsIn(rect: Rect): Pos[] {
  const out: Pos[] = [];
  for (let r = rect.r1; r <= rect.r2; r++)
    for (let c = rect.c1; c <= rect.c2; c++) out.push({ r, c });
  return out;
}

export function selectAll(b: Bounds): Selection {
  return { anchor: { r: 0, c: 0 }, focus: clampPos({ r: b.rows - 1, c: b.cols - 1 }, b) };
}

const DELTA: Record<Direction, Pos> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

export type MoveOptions = {
  /** Shift: estende l'intervallo spostando `focus` e lasciando ferma la cella attiva. */
  extend?: boolean;
  /** Ctrl/Cmd: salta fino al bordo della griglia. */
  jump?: boolean;
  /** Numero di passi (PagSu/PagGiù). */
  step?: number;
};

/** Frecce, Tab, Invio: sposta la cella attiva (o estende la selezione) restando nei limiti. */
export function move(
  sel: Selection,
  dir: Direction,
  b: Bounds,
  { extend = false, jump = false, step = 1 }: MoveOptions = {},
): Selection {
  const from = extend ? sel.focus : sel.anchor;
  const d = DELTA[dir];
  let next: Pos;
  if (jump) {
    next = {
      r: d.r === 0 ? from.r : d.r < 0 ? 0 : b.rows - 1,
      c: d.c === 0 ? from.c : d.c < 0 ? 0 : b.cols - 1,
    };
  } else {
    next = { r: from.r + d.r * step, c: from.c + d.c * step };
  }
  next = clampPos(next, b);
  return extend ? { anchor: sel.anchor, focus: next } : single(next);
}

/** Home/End (con Ctrl: prima/ultima cella della griglia). */
export function moveToEdge(
  sel: Selection,
  edge: "home" | "end",
  b: Bounds,
  { extend = false, ctrl = false }: { extend?: boolean; ctrl?: boolean } = {},
): Selection {
  const from = extend ? sel.focus : sel.anchor;
  const next = clampPos(
    {
      r: ctrl ? (edge === "home" ? 0 : b.rows - 1) : from.r,
      c: edge === "home" ? 0 : b.cols - 1,
    },
    b,
  );
  return extend ? { anchor: sel.anchor, focus: next } : single(next);
}

/** Selezione con clic + trascina o Shift+clic: la cella attiva resta dov'era. */
export function extendTo(sel: Selection, p: Pos): Selection {
  return { anchor: sel.anchor, focus: p };
}

/**
 * Incolla una matrice nella selezione.
 * - Un solo valore su un intervallo: ripetuto su tutto l'intervallo.
 * - Intervallo multiplo esatto della matrice: la matrice si ripete (come Excel).
 * - Altrimenti: la matrice parte dall'angolo in alto a sinistra della selezione
 *   (che coincide con la cella attiva quando è selezionata una cella sola) e si taglia ai bordi.
 */
export function pasteWrites(matrix: string[][], sel: Selection, b: Bounds): CellWrite[] {
  if (matrix.length === 0) return [];
  const mRows = matrix.length;
  const mCols = Math.max(...matrix.map((row) => row.length));
  if (mCols === 0) return [];
  const rect = rectOf(sel);
  const size = rectSize(rect);
  const out: CellWrite[] = [];

  const tile =
    (mRows === 1 && mCols === 1) ||
    (size.rows >= mRows &&
      size.cols >= mCols &&
      size.rows % mRows === 0 &&
      size.cols % mCols === 0 &&
      !(size.rows === mRows && size.cols === mCols));

  if (tile) {
    for (let r = rect.r1; r <= rect.r2; r++) {
      for (let c = rect.c1; c <= rect.c2; c++) {
        const value = matrix[(r - rect.r1) % mRows][(c - rect.c1) % mCols] ?? "";
        out.push({ r, c, value });
      }
    }
    return out;
  }

  for (let i = 0; i < mRows; i++) {
    const r = rect.r1 + i;
    if (r >= b.rows) break;
    for (let j = 0; j < mCols; j++) {
      const c = rect.c1 + j;
      if (c >= b.cols) break;
      out.push({ r, c, value: matrix[i][j] ?? "" });
    }
  }
  return out;
}

/**
 * Dato il rettangolo sorgente e la cella sotto il puntatore durante il trascinamento della
 * maniglia, calcola il rettangolo finale del riempimento (sorgente inclusa), solo in orizzontale
 * o in verticale. Restituisce `null` se il puntatore è dentro la sorgente.
 */
export function fillTarget(source: Rect, pointer: Pos): Rect | null {
  const down = pointer.r - source.r2;
  const up = source.r1 - pointer.r;
  const right = pointer.c - source.c2;
  const left = source.c1 - pointer.c;
  const vertical = Math.max(down, up, 0);
  const horizontal = Math.max(right, left, 0);
  if (vertical === 0 && horizontal === 0) return null;
  if (vertical >= horizontal) {
    return down > 0 ? { ...source, r2: pointer.r } : { ...source, r1: pointer.r };
  }
  return right > 0 ? { ...source, c2: pointer.c } : { ...source, c1: pointer.c };
}

/**
 * Celle da scrivere riempiendo `target` a partire da `source` (contenuto in `target`):
 * i valori della sorgente si ripetono lungo l'asse dell'estensione.
 */
export function fillWrites(
  source: Rect,
  target: Rect,
  read: (r: number, c: number) => string,
): CellWrite[] {
  const size = rectSize(source);
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  const out: CellWrite[] = [];
  for (let r = target.r1; r <= target.r2; r++) {
    for (let c = target.c1; c <= target.c2; c++) {
      if (rectContains(source, r, c)) continue;
      const sr = source.r1 + mod(r - source.r1, size.rows);
      const sc = source.c1 + mod(c - source.c1, size.cols);
      out.push({ r, c, value: read(sr, sc) });
    }
  }
  return out;
}

/**
 * Ctrl+D (in basso) / Ctrl+R (a destra), come Excel: se la selezione ha più righe (colonne)
 * copia la prima riga (colonna) sulle altre; se ne ha una sola copia quella sopra (a sinistra).
 */
export function fillShortcutWrites(
  sel: Selection,
  dir: "down" | "right",
  read: (r: number, c: number) => string,
): CellWrite[] {
  const rect = rectOf(sel);
  const out: CellWrite[] = [];
  if (dir === "down") {
    const multi = rect.r2 > rect.r1;
    const srcRow = multi ? rect.r1 : rect.r1 - 1;
    if (srcRow < 0) return [];
    for (let r = multi ? rect.r1 + 1 : rect.r1; r <= rect.r2; r++)
      for (let c = rect.c1; c <= rect.c2; c++) out.push({ r, c, value: read(srcRow, c) });
  } else {
    const multi = rect.c2 > rect.c1;
    const srcCol = multi ? rect.c1 : rect.c1 - 1;
    if (srcCol < 0) return [];
    for (let r = rect.r1; r <= rect.r2; r++)
      for (let c = multi ? rect.c1 + 1 : rect.c1; c <= rect.c2; c++)
        out.push({ r, c, value: read(r, srcCol) });
  }
  return out;
}

/** Matrice dei valori dell'intervallo (per la copia). */
export function readRect(rect: Rect, read: (r: number, c: number) => string): string[][] {
  const out: string[][] = [];
  for (let r = rect.r1; r <= rect.r2; r++) {
    const row: string[] = [];
    for (let c = rect.c1; c <= rect.c2; c++) row.push(read(r, c));
    out.push(row);
  }
  return out;
}
