import { z } from "zod";

export const THEME_COOKIE = "tema";
export const themeSchema = z.enum(["sistema", "chiaro", "scuro"]);
export type Theme = z.infer<typeof themeSchema>;

/** Valore dell'attributo data-theme su <html>: assente = segue il sistema. */
export function themeAttribute(theme: string | undefined): "light" | "dark" | undefined {
  if (theme === "chiaro") return "light";
  if (theme === "scuro") return "dark";
  return undefined;
}
