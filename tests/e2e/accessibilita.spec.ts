import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

/** §9 Accessibilità: nessuna violazione seria o critica (axe-core) sulle pagine principali. */
const PAGES = [
  "/",
  "/orari",
  "/orari/negozio",
  "/richieste",
  "/richieste/nuova",
  "/ferie",
  "/obiettivi",
  "/comunicazioni",
  "/comunicazioni/responsabilita",
  "/comunicazioni/responsabilita/spunte",
  "/performance",
  "/profilo",
  "/notifiche",
  "/admin",
  "/admin/dipendenti",
  "/admin/turni",
  "/admin/ferie",
  "/admin/richieste",
  "/admin/comunicazioni",
  "/admin/obiettivi",
  "/admin/performance",
  "/admin/impostazioni",
  "/admin/impostazioni/regole",
  "/admin/registro",
];

test("accesso: pagina senza violazioni serie", async ({ page }) => {
  await page.goto("/accesso");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
});

test("pagine dell'app senza violazioni serie o critiche", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, ADMIN.code, ADMIN.pin);
  const report: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    for (const v of results.violations.filter((x) =>
      ["serious", "critical"].includes(x.impact ?? ""),
    )) {
      report.push(
        `${path} · ${v.id} (${v.impact}) · ${v.nodes.length}× · ${v.nodes[0]?.target.join(" ")}`,
      );
    }
  }
  expect(report).toEqual([]);
});
