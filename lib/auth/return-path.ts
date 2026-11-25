/**
 * Percorso a cui tornare dopo l'accesso (`/accesso?da=…`): solo indirizzi interni.
 *
 * Non basta guardare i primi caratteri: i browser tolgono tab e a-capo dagli URL e leggono la
 * barra rovesciata come `/`, quindi `/%09/evil.example` diventerebbe `//evil.example` (un altro
 * sito). Si rifiutano caratteri di controllo e barre rovesciate, poi si risolve come farebbe il
 * browser e si accetta solo la stessa origin; si riusano percorso e query così come risolti.
 */
export function safeReturnPath(raw: string | undefined | null, fallback = "/"): string {
  if (!raw || raw.length > 2000 || !raw.startsWith("/")) return fallback;
  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    // Caratteri di controllo (tab, a-capo, DEL…) e barra rovesciata: mai in un percorso nostro.
    if (code <= 0x1f || code === 0x7f || ch === "\\") return fallback;
  }
  const base = "https://portale.invalid";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  const path = url.pathname;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  // Uscita, accesso e API non sono pagine a cui "tornare".
  if (/^\/(esci|accesso|api)(\/|$)/.test(path)) return fallback;
  return `${path}${url.search}`;
}
