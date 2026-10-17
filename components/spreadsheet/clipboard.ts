/**
 * Testo per gli appunti compatibile con Excel, Numbers e Google Fogli:
 * celle separate da tabulazione, righe da a-capo; le celle che contengono tabulazioni,
 * a-capo o virgolette sono racchiuse tra virgolette, con le virgolette interne raddoppiate.
 */

/** Legge il testo incollato (da Excel o da un'altra griglia) in una matrice di stringhe. */
export function parseTSV(text: string): string[][] {
  if (text === "") return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let atFieldStart = true;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
    atFieldStart = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (atFieldStart && ch === '"') {
      // Campo tra virgolette: fino alla virgoletta di chiusura (le "" valgono una ").
      let j = i + 1;
      let value = "";
      let closed = false;
      while (j < n) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        value += text[j];
        j++;
      }
      const next = text[j];
      if (closed && (j >= n || next === "\t" || next === "\n" || next === "\r")) {
        field = value;
        i = j;
        atFieldStart = false;
        continue;
      }
      // Virgolette non bilanciate o testo dopo la chiusura: si tratta la virgoletta come testo.
      field += ch;
      i++;
      atFieldStart = false;
      continue;
    }
    atFieldStart = false;
    if (ch === "\t") {
      endField();
      i++;
    } else if (ch === "\r") {
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
    } else if (ch === "\n") {
      endRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  // L'a-capo finale che Excel aggiunge sempre non produce una riga vuota in più.
  if (!(atFieldStart && row.length === 0 && field === "")) endRow();
  return rows;
}

function quoteCell(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Converte una matrice in testo per gli appunti (righe separate da \n, senza a-capo finale). */
export function toTSV(matrix: string[][]): string {
  return matrix.map((row) => row.map(quoteCell).join("\t")).join("\n");
}
