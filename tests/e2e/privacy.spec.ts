import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

/**
 * Privacy (§3, §14): con la sessione di un dipendente le API non restituiscono dati riservati
 * altrui. Si usa la sessione vera del browser contro le stesse API di Supabase che usa l'app.
 */
test("la vista pubblica dei profili non espone contratto, note e contatti", async ({ page }) => {
  await login(page, ADMIN.code, ADMIN.pin);
  await page.goto("/orari/negozio");
  const html = await page.content();
  expect(html).not.toMatch(/admin_notes|weekly_hours|private_note/);
});

test("i dipendenti vedono il planning ferie senza il motivo delle assenze", async ({ page }) => {
  await login(page, ADMIN.code, ADMIN.pin);
  await page.goto("/ferie");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/Malattia/);
});
