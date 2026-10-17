import { expect, test } from "@playwright/test";
import { addDays, format, startOfWeek } from "date-fns";
import { ADMIN, expectNoServerErrors, login } from "./helpers";

// Una settimana lontana, così il test non tocca i dati di lavoro.
const week = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7 * 20), "yyyy-MM-dd");

test.describe("Foglio turni (§8.1, §16)", () => {
  test("compilazione da tastiera, cella non valida, pubblicazione e modifiche da ripubblicare", async ({
    page,
  }) => {
    await login(page, ADMIN.code, ADMIN.pin);
    await expectNoServerErrors(page, async () => {
      await page.goto(`/admin/turni/${week}`);
      const grid = page.getByRole("grid");
      await expect(grid).toBeVisible();

      await page.locator("[data-cell]").first().click();
      await page.keyboard.type("MAN");
      await page.keyboard.press("Tab");
      await page.keyboard.type("10-14 16-20");
      await page.keyboard.press("Enter");
      await expect(page.getByText("Salvato")).toBeVisible();

      // Valore non valido: la cella non cambia e compare un messaggio.
      await page.locator("[data-cell]").nth(2).click();
      await page.keyboard.type("zzz");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("grid")).toContainText(/sconosciut|non valid/i);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: /^Pubblica$/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Pubblica" }).click();
      await expect(page.getByText("Settimana pubblicata.")).toBeVisible();
      await page.keyboard.press("Escape");

      await page.reload();
      await expect(page.getByText(/Pubblicata · v/i)).toBeVisible();
      await page.locator("[data-cell]").nth(3).click();
      await page.keyboard.type("12-20");
      await page.keyboard.press("Enter");
      await expect(page.getByText(/modifiche da pubblicare/i)).toBeVisible();
    });
  });

  test("modalità foglio orario e export", async ({ page }) => {
    await login(page, ADMIN.code, ADMIN.pin);
    await page.goto(`/admin/turni/${week}`);
    await page.getByRole("radio", { name: /Foglio orario/ }).click();
    await expect(page.getByText("ORARIO").first()).toBeVisible();
    for (const q of ["formato=xlsx", "formato=pdf", "formato=pdf&layout=week"]) {
      const res = await page.request.get(`/api/export/turni/${week}?${q}`);
      expect(res.status(), q).toBe(200);
    }
  });

  test("regole di pianificazione: anteprima delle violazioni @telefono", async ({ page }) => {
    await login(page, ADMIN.code, ADMIN.pin);
    await page.goto("/admin/impostazioni/regole");
    await expect(page.getByText("COP. OTT.").first()).toBeVisible();
    await page.getByRole("button", { name: "Nuova regola" }).click();
    await page.fill("#rule-name", "Sabato Vista");
    await expect(page.getByText(/Anteprima: \d+ violazion/)).toBeVisible();
  });
});
