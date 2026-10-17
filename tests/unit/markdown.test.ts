import { describe, expect, it } from "vitest";
import { escapeHtml, markdownToText, renderInline, renderMarkdown, safeUrl } from "@/lib/markdown";

describe("renderMarkdown: sicurezza", () => {
  it("fa l'escape di qualsiasi HTML", () => {
    const html = renderMarkdown('<script>alert("x")</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("scarta i link javascript: e data:", () => {
    expect(renderMarkdown("[clic](javascript:alert(1))")).not.toContain("<a");
    expect(renderMarkdown("[clic](data:text/html,ciao)")).not.toContain("<a");
    expect(renderMarkdown("[clic](/relativo)")).not.toContain("<a");
  });

  it("non permette di uscire dall'attributo href", () => {
    const html = renderMarkdown('[x](https://a.it/"onmouseover="alert(1))');
    expect(html).not.toMatch(/"\s*onmouseover=/);
  });

  it("i link hanno rel noopener e si aprono in una nuova scheda", () => {
    const html = renderMarkdown("[Portale](https://portale.example.com/a?b=1&c=2)");
    expect(html).toBe(
      '<p><a href="https://portale.example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">Portale</a></p>',
    );
  });

  it("i caratteri di controllo usati internamente non rompono il risultato", () => {
    expect(renderMarkdown("a\u00000\u0000b")).toBe("<p>a0b</p>");
  });
});

describe("renderMarkdown: formattazione", () => {
  it("paragrafi separati da una riga vuota, a capo dentro il paragrafo", () => {
    expect(renderMarkdown("Prima riga\nseconda riga\n\nAltro paragrafo")).toBe(
      "<p>Prima riga<br>seconda riga</p>\n<p>Altro paragrafo</p>",
    );
  });

  it("grassetto e corsivo", () => {
    expect(renderInline("**Importante** e *subito* e _anche_ __qui__")).toBe(
      "<strong>Importante</strong> e <em>subito</em> e <em>anche</em> <strong>qui</strong>",
    );
  });

  it("gli asterischi isolati restano testo", () => {
    expect(renderInline("2 * 3 = 6")).toBe("2 * 3 = 6");
    expect(renderInline("nome_cognome_file")).toBe("nome_cognome_file");
  });

  it("titoli ## e ###", () => {
    expect(renderMarkdown("## Procedura\n### Dettagli")).toBe(
      "<h2>Procedura</h2>\n<h3>Dettagli</h3>",
    );
    expect(renderMarkdown("# Titolo")).toBe("<h2>Titolo</h2>");
  });

  it("titoli sotto un h2 della pagina", () => {
    expect(renderMarkdown("## A\n### B", { headingLevel: 3 })).toBe("<h3>A</h3>\n<h4>B</h4>");
  });

  it("elenchi puntati e numerati", () => {
    expect(renderMarkdown("- uno\n- **due**\n\n1. primo\n2. secondo")).toBe(
      "<ul><li>uno</li><li><strong>due</strong></li></ul>\n<ol><li>primo</li><li>secondo</li></ol>",
    );
  });

  it("un elenco subito dopo un paragrafo", () => {
    expect(renderMarkdown("Da fare:\n- pacchi\n- bolle")).toBe(
      "<p>Da fare:</p>\n<ul><li>pacchi</li><li>bolle</li></ul>",
    );
  });

  it("riconosce gli indirizzi scritti in chiaro senza la punteggiatura finale", () => {
    expect(renderInline("Vedi https://example.com/x.")).toBe(
      'Vedi <a href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow">https://example.com/x</a>.',
    );
  });

  it("gli asterischi dentro gli URL non diventano corsivo", () => {
    expect(renderInline("[a](https://x.it/*b*) *c*")).toContain('href="https://x.it/*b*"');
    expect(renderInline("[a](https://x.it/*b*) *c*")).toContain("<em>c</em>");
  });

  it("testo vuoto", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null)).toBe("");
  });
});

describe("utilità", () => {
  it("escapeHtml", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("safeUrl", () => {
    expect(safeUrl("https://a.it")).toBe("https://a.it/");
    expect(safeUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeUrl("ftp://a.it")).toBeNull();
  });

  it("markdownToText", () => {
    expect(markdownToText("## Titolo\n- **uno** [link](https://a.it)")).toBe("Titolo uno link");
  });
});
