/**
 * PostgREST restituisce al massimo 1000 righe per richiesta (impostazione del progetto): le
 * letture che possono superarle vanno fatte a pagine, altrimenti i dati arrivano troncati in
 * silenzio. Modulo puro (niente `server-only`): si prova con una funzione di pagina finta.
 */

/** Righe chieste per pagina: non oltre il tetto predefinito di PostgREST. */
export const PAGE_SIZE = 1000;

/** Quello che serve di una risposta di supabase-js. */
export type PageResult<T> = {
  data: T[] | null;
  error: unknown;
  /** Totale delle righe (con `select(…, { count: "exact" })`): evita una richiesta in più. */
  count?: number | null;
};

/**
 * Legge tutte le righe di una query, una pagina alla volta. `page(from, to)` deve applicare
 * `.range(from, to)` a una query con un ORDINAMENTO STABILE (chiave univoca), altrimenti tra una
 * pagina e l'altra le righe possono ripetersi o mancare.
 *
 * Si ferma quando ha letto `count` righe (se la query lo chiede), quando una pagina torna vuota
 * oppure, senza `count`, quando una pagina è più corta di quanto chiesto. Avanza di quante righe
 * sono arrivate davvero: se il server ha un tetto più basso della pagina chiesta e la query
 * chiede il `count`, non si perde nulla. Un errore interrompe la lettura (mai dati parziali).
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const { data, error, count } = await page(out.length, out.length + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length === 0) break;
    if (typeof count === "number") {
      if (out.length >= count) break;
    } else if (rows.length < pageSize) break;
  }
  return out;
}

/** Divide un elenco in blocchi (es. gli id di un filtro `in`, che viaggiano nell'indirizzo). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
