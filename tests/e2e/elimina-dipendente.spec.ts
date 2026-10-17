import { expect, test } from "@playwright/test";
import { ADMIN, login, uniqueSuffix } from "./helpers";

test("un admin elimina un dipendente creato per errore", async ({ page }) => {
  const suffix = uniqueSuffix();
  await login(page, ADMIN.code, ADMIN.pin);
  await page.goto("/admin/dipendenti/nuovo");
  await page.fill("#firstName", "Errore");
  await page.fill("#lastName", `E2E ${suffix}`);
  await page.fill("#displayName", `Errore ${suffix}`);
  await page.getByLabel("Addetti vendita").check();
  await page.getByRole("button", { name: "Crea dipendente" }).click();
  await expect(page.getByText("PIN provvisorio")).toBeVisible();
  const code = (await page.locator("dd").nth(0).innerText()).trim();

  // L'elenco può arrivare un attimo prima che la nuova persona sia visibile: si ricarica.
  await expect(async () => {
    await page.goto("/admin/dipendenti");
    await expect(page.getByRole("link", { name: new RegExp(`Errore ${suffix}`) })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 30000 });
  await page.getByRole("link", { name: new RegExp(`Errore ${suffix}`) }).click();
  await page.waitForURL(/\/admin\/dipendenti\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Errore ${suffix}`);

  await page.getByRole("button", { name: "Elimina account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Cosa verrà eliminato");
  await expect(dialog).toContainText("non ha ancora usato il portale");
  const confirm = dialog.getByRole("button", { name: "Elimina definitivamente" });
  // Il pulsante si abilita solo scrivendo il nome esatto.
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Per confermare scrivi il nome/).fill("Errore");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Per confermare scrivi il nome/).fill(`errore  ${suffix.toLowerCase()}`);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page).toHaveURL(/\/admin\/dipendenti\?eliminato=/);
  await expect(page.getByRole("status")).toContainText("è stata eliminata");
  await expect(page.getByRole("link", { name: new RegExp(`Errore ${suffix}`) })).toHaveCount(0);

  // L'accesso non esiste più.
  const res = await page.request.post("/api/auth/pin", { data: { code, pin: "482913" } });
  expect(res.status()).toBe(401);
});

test("annullando la finestra non si elimina nulla", async ({ page }) => {
  const suffix = uniqueSuffix();
  await login(page, ADMIN.code, ADMIN.pin);
  await page.goto("/admin/dipendenti/nuovo");
  await page.fill("#firstName", "Resta");
  await page.fill("#lastName", `E2E ${suffix}`);
  await page.fill("#displayName", `Resta ${suffix}`);
  await page.getByLabel("Ottici").check();
  await page.getByRole("button", { name: "Crea dipendente" }).click();
  await expect(page.getByText("PIN provvisorio")).toBeVisible();
  // L'elenco può arrivare un attimo prima che la nuova persona sia visibile: si ricarica.
  await expect(async () => {
    await page.goto("/admin/dipendenti");
    await expect(page.getByRole("link", { name: new RegExp(`Resta ${suffix}`) })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 30000 });
  await page.getByRole("link", { name: new RegExp(`Resta ${suffix}`) }).click();
  await page.waitForURL(/\/admin\/dipendenti\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Elimina account" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/admin/dipendenti");
  await expect(page.getByRole("link", { name: new RegExp(`Resta ${suffix}`) })).toHaveCount(1);
});

test("l'admin non può eliminare se stesso", async ({ page }) => {
  await login(page, ADMIN.code, ADMIN.pin);
  await page.goto("/admin/dipendenti");
  await page
    .getByRole("link", { name: /^Admin/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Elimina account" })).toHaveCount(0);
});
