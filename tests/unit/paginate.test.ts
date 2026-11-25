import { describe, expect, it } from "vitest";
import { chunk, fetchAllRows, type PageResult } from "@/lib/data/paginate";

/** Finta tabella dietro un server che non restituisce mai più di `cap` righe per richiesta. */
function fakeTable(total: number, cap: number, withCount: boolean) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to]);
    return {
      data: rows.slice(from, Math.min(to + 1, from + cap)),
      error: null,
      count: withCount ? total : undefined,
    };
  };
  return { page, calls, rows };
}

describe("lettura a pagine (limite di 1000 righe di PostgREST)", () => {
  it("legge tutte le righe oltre la prima pagina, nell'ordine", async () => {
    const t = fakeTable(2350, 1000, true);
    expect(await fetchAllRows(t.page)).toEqual(t.rows);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("con il conteggio non fa una richiesta in più quando il totale è un multiplo esatto", async () => {
    const t = fakeTable(2000, 1000, true);
    expect(await fetchAllRows(t.page)).toHaveLength(2000);
    expect(t.calls).toHaveLength(2);
  });

  it("senza conteggio si ferma alla prima pagina corta (o vuota)", async () => {
    const short = fakeTable(1200, 1000, false);
    expect(await fetchAllRows(short.page)).toHaveLength(1200);
    expect(short.calls).toHaveLength(2);
    const exact = fakeTable(2000, 1000, false);
    expect(await fetchAllRows(exact.page)).toHaveLength(2000);
    expect(exact.calls).toHaveLength(3);
  });

  it("se il server ha un tetto più basso della pagina chiesta, con il conteggio non perde righe", async () => {
    const t = fakeTable(1100, 300, true);
    expect(await fetchAllRows(t.page)).toEqual(t.rows);
    expect(t.calls.map(([from]) => from)).toEqual([0, 300, 600, 900]);
  });

  it("tabella vuota e data null", async () => {
    expect(await fetchAllRows(fakeTable(0, 1000, true).page)).toEqual([]);
    expect(await fetchAllRows(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it("un errore interrompe la lettura: mai dati parziali", async () => {
    let n = 0;
    const page = async (): Promise<PageResult<number>> =>
      n++ === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null, count: 1500 }
        : { data: null, error: { message: "timeout" } };
    await expect(fetchAllRows(page)).rejects.toEqual({ message: "timeout" });
  });

  it("pagina di dimensione diversa", async () => {
    const t = fakeTable(9, 1000, true);
    expect(await fetchAllRows(t.page, 2)).toEqual(t.rows);
    expect(t.calls).toHaveLength(5);
  });
});

describe("blocchi di id", () => {
  it("divide senza perdere elementi", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});
