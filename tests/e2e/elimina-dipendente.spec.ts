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

  await page.goto("/admin/dipendenti");
  await page.getByRole("link", { name: new RegExp(`Errore ${suffix}`) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Errore ${suffix}`);

  page.once("dialog", (d) => {
    expect(d.message()).toContain("Eliminare definitivamente");
    void d.accept();
  });
  await page.getByRole("button", { name: "Elimina account" }).click();
  await expect(page).toHaveURL(/\/admin\/dipendenti$/);
  await expect(page.getByText(`Errore ${suffix}`)).toHaveCount(0);

  // L'accesso non esiste più.
  const res = await page.request.post("/api/auth/pin", { data: { code, pin: "482913" } });
  expect(res.status()).toBe(401);
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
