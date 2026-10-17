import type * as React from "react";

export type GridColumn = {
  id: string;
  label: string;
  sublabel?: string;
  /** Larghezza in px (default: 72 compatto, 96 comodo). */
  width?: number;
  /** Oggi: bordo nero superiore spesso. */
  highlight?: boolean;
  /** Weekend e festivi: leggermente ombreggiati. */
  shaded?: boolean;
  /** Classi aggiuntive per le celle di questa colonna. */
  className?: string;
};

export type GridRow = {
  id: string;
  label: string;
  sublabel?: string;
  groupId?: string;
  /** Bordo sinistro sottile col colore personale. */
  accentColor?: string;
  /** Classi aggiuntive per le celle di questa riga. */
  className?: string;
};

export type GridGroup = { id: string; label: string; collapsible?: boolean };

export type CellChange = { rowId: string; colId: string; value: string };

export type CellTone =
  "default" | "muted" | "danger" | "warning" | "success" | "hatched" | "dashed";

export type CellState = {
  readOnly?: boolean;
  tone?: CellTone;
  title?: string;
  className?: string;
};

export type FooterRow = {
  id: string;
  label: string;
  cells: Record<string, React.ReactNode>;
  cellClassName?: (colId: string) => string | undefined;
};

export type Density = "compact" | "comfortable";

export type SaveState = "idle" | "saving" | "saved" | "error";

export type NormalizeResult = { value: string } | { error: string };

export type MobileEditorContext = {
  rowId: string;
  colId: string;
  value: string;
  close: () => void;
  commit: (value: string) => void;
};

export type SpreadsheetGridProps = {
  rows: GridRow[];
  columns: GridColumn[];
  /** Righe raggruppate (intestazioni collassabili) in base a `row.groupId`. */
  groups?: GridGroup[];
  /** Testo grezzo della cella: quello che si edita e si copia. */
  getValue: (rowId: string, colId: string) => string;
  /** Visualizzazione della cella (default: il testo). Per le prestazioni passala stabile (useCallback). */
  renderCell?: (rowId: string, colId: string, value: string) => React.ReactNode;
  getCellState?: (rowId: string, colId: string) => CellState | undefined;
  /**
   * Sempre a lotti: incolla, riempimento, Canc su un intervallo, annulla/ripeti = una sola chiamata.
   * Assente o `readOnly` => sola lettura.
   */
  onChange?: (changes: CellChange[]) => void;
  /**
   * Valida/normalizza l'input digitato o incollato. In caso di errore la cella non cambia e
   * compare un messaggio breve. Non viene chiamata per il valore vuoto (svuotare è sempre lecito).
   */
  normalize?: (value: string) => NormalizeResult;
  readOnly?: boolean;
  /** Righe di riepilogo in fondo, fisse in basso nello scroll verticale. */
  footerRows?: FooterRow[];
  /** Intestazione della prima colonna (es. "Persona"). */
  rowHeaderLabel?: string;
  /** Zoom iniziale; con `showDensityToggle` l'utente può cambiarlo. */
  density?: Density;
  showDensityToggle?: boolean;
  /** Indicatore "Salvato" in alto a destra. */
  saveState?: SaveState;
  /** Altri admin che stanno modificando. */
  presence?: { id: string; name: string }[];
  /** Contenuto extra nella barra sopra la griglia. */
  toolbar?: React.ReactNode;
  /** Doppio clic / Alt+Invio: apre un popover dettagliato gestito dal chiamante. */
  onCellActivate?: (rowId: string, colId: string) => void;
  /** Su schermi touch/stretti: tocco su cella => foglio dal basso con questo contenuto. */
  renderMobileEditor?: (ctx: MobileEditorContext) => React.ReactNode;
  onRowHeaderClick?: (rowId: string) => void;
  /** "Evidenzia me". */
  highlightRowId?: string;
  ariaLabel: string;
  className?: string;
};
