/**
 * Renderer markdown minimale e SICURO per comunicazioni e procedure.
 *
 * Supporta: paragrafi, a capo, titoli `##` e `###`, **grassetto**, *corsivo* (anche _corsivo_),
 * elenchi puntati (`-`, `*`) e numerati (`1.`), link `[testo](https://…)` e indirizzi http(s)
 * scritti in chiaro. Tutto il resto è testo: l'HTML in ingresso viene sempre sottoposto a escape,
 * quindi il risultato si può inserire con `dangerouslySetInnerHTML`.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Accetta solo URL http(s) ben formati; tutto il resto (javascript:, data:, relativi) è scartato. */
export function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function link(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
}

// Segnaposto che non possono comparire in un testo digitato.
const MARK = "\u0000";

/** Formattazione in linea: lavora sul testo grezzo e restituisce HTML sicuro. */
export function renderInline(raw: string): string {
  const tokens: string[] = [];
  const stash = (html: string) => `${MARK}${tokens.push(html) - 1}${MARK}`;

  let text = raw.replaceAll(MARK, "");

  // [testo](url): l'url deve essere http(s), altrimenti resta il testo.
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    const url = safeUrl(href);
    return url ? stash(link(url, renderEmphasis(escapeHtml(label)))) : whole;
  });

  // Indirizzi in chiaro.
  text = text.replace(/\bhttps?:\/\/[^\s<>"']+/g, (match: string) => {
    // La punteggiatura finale di solito chiude la frase, non fa parte del link.
    const trail = /[.,;:!?)]+$/.exec(match)?.[0] ?? "";
    const href = trail ? match.slice(0, -trail.length) : match;
    const url = safeUrl(href);
    return url ? stash(link(url, escapeHtml(href))) + trail : match;
  });

  let html = renderEmphasis(escapeHtml(text));
  html = html.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_, i: string) => tokens[+i]);
  return html;
}

/** Grassetto e corsivo su testo già sottoposto a escape. */
function renderEmphasis(escaped: string): string {
  return escaped
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, "$1<em>$2</em>");
}

type Block =
  | { type: "p"; lines: string[] }
  | { type: "h"; level: 2 | 3; text: string }
  | { type: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;

function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let current = null as Block | null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      // `#` diventa comunque un titolo di sezione: il titolo della pagina è già sopra.
      blocks.push({ type: "h", level: heading[1].length <= 2 ? 2 : 3, text: heading[2] });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      if (current?.type !== type) {
        flush();
        current = { type, items: [] };
      }
      (current as { items: string[] }).items.push(item);
      continue;
    }
    if (current && (current.type === "ul" || current.type === "ol") && /^\s{2,}\S/.test(line)) {
      // Riga rientrata: continua la voce precedente.
      const items: string[] = current.items;
      items[items.length - 1] += `\n${line.trim()}`;
      continue;
    }
    if (current?.type !== "p") {
      flush();
      current = { type: "p", lines: [] };
    }
    (current as { lines: string[] }).lines.push(line.trim());
  }
  flush();
  return blocks;
}

const lineBreaks = (html: string) => html.replace(/\n/g, "<br>");

/**
 * `headingLevel` = livello HTML dei titoli `##` (i `###` scendono di uno): 2 di default, 3 quando
 * il testo sta sotto un titolo h2 della pagina.
 */
export function renderMarkdown(
  md: string | null | undefined,
  opts: { headingLevel?: 2 | 3 } = {},
): string {
  if (!md) return "";
  const shift = (opts.headingLevel ?? 2) - 2;
  return parseBlocks(md)
    .map((block) => {
      switch (block.type) {
        case "h": {
          const level = block.level + shift;
          return `<h${level}>${renderInline(block.text)}</h${level}>`;
        }
        case "ul":
        case "ol":
          return `<${block.type}>${block.items
            .map((item) => `<li>${lineBreaks(renderInline(item))}</li>`)
            .join("")}</${block.type}>`;
        case "p":
          return `<p>${lineBreaks(renderInline(block.lines.join("\n")))}</p>`;
      }
    })
    .join("\n");
}

/** Testo semplice (per anteprime e ricerche): niente segni di formattazione. */
export function markdownToText(md: string | null | undefined): string {
  if (!md) return "";
  return md
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*([-*•]|\d{1,3}[.)])\s+/gm, "")
    .replace(/\*\*|__|[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
