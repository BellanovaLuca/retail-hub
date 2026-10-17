/** Confronto del nome digitato per confermare un'eliminazione: senza maiuscole e spazi in più. */
export function sameName(typed: string, displayName: string) {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
  return norm(typed) !== "" && norm(typed) === norm(displayName);
}
