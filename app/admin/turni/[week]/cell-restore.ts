/**
 * Memoria delle giornate per Annulla/Ripeti nel foglio turni (§8.1).
 *
 * La griglia annulla riportando nella cella il TESTO di prima («10–19»), ma una giornata è più
 * del suo testo: pausa, nota, area, reparto, back office, turno rapido. Ogni volta che una cella
 * sta per cambiare si ricorda com'era la giornata sotto il testo che mostrava; quando Annulla (o
 * Ripeti) riporta quel testo, le righe ricordate partono insieme al testo e il server le rimette
 * com'erano. Una riscrittura a mano dello stesso testo NON le riprende: vale solo per
 * annulla/ripeti.
 */
import type { ShiftRecord } from "@/lib/schedule/types";
import type { RestoreRow } from "../day-rows";

/** Giornata salvata → righe da ripristinare (stesse colonne di `shifts`). */
export function snapshotOf(dayShifts: ShiftRecord[]): RestoreRow[] {
  return dayShifts.map((s) => ({
    template_id: s.templateId,
    start_time: s.start,
    end_time: s.end,
    break_minutes: s.breakMinutes,
    working_as_department_id: s.departmentId,
    zone: s.zone,
    is_back_office: s.isBackOffice,
    note: s.note,
  }));
}

/** Quanti testi diversi si ricordano per cella (bastano gli ultimi passi di annulla). */
const TEXTS_PER_CELL = 12;

export function createCellMemory() {
  const byCell = new Map<string, Map<string, RestoreRow[]>>();
  return {
    /** La cella `cellKey` mostra `text` e sotto ha queste righe: se cambia, si potrà tornare qui. */
    remember(cellKey: string, text: string, rows: RestoreRow[]) {
      if (text === "" || rows.length === 0) return;
      const texts = byCell.get(cellKey) ?? new Map<string, RestoreRow[]>();
      // In fondo il più recente: quando sono troppi si toglie il più vecchio.
      texts.delete(text);
      texts.set(text, rows);
      if (texts.size > TEXTS_PER_CELL) texts.delete(texts.keys().next().value!);
      byCell.set(cellKey, texts);
    },
    /** Righe ricordate per quella cella quando mostrava `text` (undefined = mai vista così). */
    recall(cellKey: string, text: string): RestoreRow[] | undefined {
      return byCell.get(cellKey)?.get(text);
    },
  };
}

export type CellMemory = ReturnType<typeof createCellMemory>;
