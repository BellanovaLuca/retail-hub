import { expect, test } from "@playwright/test";
import { ADMIN, freshPin, login, uniqueSuffix } from "./helpers";

test.describe("Accesso con codice + PIN (§4, §16)", () => {
  test("PIN sbagliato: messaggio generico, nessun accesso", async ({ page }) => {
    await page.goto("/accesso");
    await page.fill("#code", ADMIN.code);
    await page.fill("#pin", "111999");
    await page.click("button[type=submit]");
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "Codice o PIN non corretti",
    );
    await expect(page).toHaveURL(/\/accesso/);
  });

  test("blocco dopo 5 tentativi errati sullo stesso codice", async ({ page }) => {
    const code = `BLK-${uniqueSuffix()}`;
    await page.goto("/accesso");
    for (let i = 0; i < 5; i++) {
      await page.fill("#code", code);
      await page.fill("#pin", "482913");
      await page.click("button[type=submit]");
      await expect(page.locator("form").getByRole("alert")).toBeVisible();
    }
    await page.fill("#pin", "482913");
    await page.click("button[type=submit]");
    await expect(page.locator("form").getByRole("alert")).toContainText("Troppi tentativi");
  });

  test("le pagine protette rimandano all'accesso", async ({ page }) => {
    await page.goto("/admin/turni");
    await expect(page).toHaveURL(/\/accesso\?da=%2Fadmin%2Fturni/);
  });

  test("un admin crea un dipendente; il dipendente entra, cambia il PIN e non vede l'area admin", async ({
    page,
    browser,
  }) => {
    const suffix = uniqueSuffix();
    await login(page, ADMIN.code, ADMIN.pin);
    await page.goto("/admin/dipendenti/nuovo");
    await page.fill("#firstName", "Prova");
    await page.fill("#lastName", `E2E ${suffix}`);
    await page.fill("#displayName", `Prova ${suffix}`);
    await page.getByLabel("Addetti vendita").check();
    await page.getByRole("button", { name: "Crea dipendente" }).click();
    await expect(page.getByText("PIN provvisorio")).toBeVisible();
    const code = (await page.locator("dd").nth(0).innerText()).trim();
    const pin = (await page.locator("dd").nth(1).innerText()).trim();
    expect(pin).toMatch(/^\d{6}$/);

    const employee = await (await browser.newContext()).newPage();
    await login(employee, code, pin, freshPin());
    await expect(employee.getByRole("heading", { level: 1 })).toContainText(`Prova ${suffix}`);
    await employee.goto("/admin");
    await expect(employee).toHaveURL("/");
  });

  test('nome visualizzato univoco: due "Francy" non sono ammesse', async ({ page }) => {
    await login(page, ADMIN.code, ADMIN.pin);
    await page.goto("/admin/dipendenti/nuovo");
    await page.fill("#firstName", "Francesca");
    await page.fill("#lastName", "Doppione");
    await page.fill("#displayName", "francy");
    await page.getByLabel("Ottici").check();
    await page.getByRole("button", { name: "Crea dipendente" }).click();
    await expect(page.getByText("già usato da un'altra persona")).toBeVisible();
  });
});
