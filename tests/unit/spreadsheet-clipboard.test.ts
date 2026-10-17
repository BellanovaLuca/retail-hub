import { describe, expect, it } from "vitest";
import { parseTSV, toTSV } from "@/components/spreadsheet/clipboard";

describe("parseTSV (testo copiato da Excel)", () => {
  it("separa celle con tabulazione e righe con a-capo", () => {
    expect(parseTSV("MAN\tR\n10-14\tF")).toEqual([
      ["MAN", "R"],
      ["10-14", "F"],
    ]);
  });

  it("ignora il \\r\\n finale che Excel aggiunge sempre", () => {
    expect(parseTSV("MAN\tR\r\n10-14\tF\r\n")).toEqual([
      ["MAN", "R"],
      ["10-14", "F"],
    ]);
    expect(parseTSV("MAN\r\n")).toEqual([["MAN"]]);
  });

  it("mantiene le celle vuote, anche in fondo alla riga e righe intere vuote", () => {
    expect(parseTSV("a\t\tc\r\n\t\t\r\nx\t\t\r\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
      ["x", "", ""],
    ]);
  });

  it("gestisce le celle tra virgolette con a-capo, tabulazioni e virgolette raddoppiate", () => {
    expect(parseTSV('"riga 1\nriga 2"\tb\r\n"con ""virgolette"""\t"a\tb"\r\n')).toEqual([
      ["riga 1\nriga 2", "b"],
      ['con "virgolette"', "a\tb"],
    ]);
  });

  it("tratta come testo le virgolette in mezzo o non bilanciate", () => {
    expect(parseTSV('10" pollici\tok')).toEqual([['10" pollici', "ok"]]);
    expect(parseTSV('"aperta\tb')).toEqual([['"aperta', "b"]]);
  });

  it("valore singolo e testo vuoto", () => {
    expect(parseTSV("F")).toEqual([["F"]]);
    expect(parseTSV("")).toEqual([]);
  });

  it("accetta anche fine riga \\r da solo (vecchi Mac)", () => {
    expect(parseTSV("a\rb")).toEqual([["a"], ["b"]]);
  });
});

describe("toTSV", () => {
  it("unisce con tabulazioni e \\n", () => {
    expect(
      toTSV([
        ["MAN", ""],
        ["", "R"],
      ]),
    ).toBe("MAN\t\n\tR");
  });

  it("mette tra virgolette solo le celle che lo richiedono", () => {
    expect(toTSV([["a\nb", 'x"y', "c\td", "ok"]])).toBe('"a\nb"\t"x""y"\t"c\td"\tok');
  });

  it("è l'inverso di parseTSV", () => {
    const m = [
      ["10-14 16-20", "", 'nota "breve"'],
      ["due\nrighe", "F?", ""],
    ];
    expect(parseTSV(toTSV(m))).toEqual(m);
  });
});
