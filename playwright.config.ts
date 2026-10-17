import { defineConfig, devices } from "@playwright/test";

/**
 * Test end-to-end (§15 M12). Richiedono lo stack locale acceso con i dati di prova:
 *   scripts/local-stack/start.sh && pnpm seed:admin && pnpm seed:dev
 * e l'app avviata (o lasciata avviare da Playwright): E2E_BASE_URL=http://localhost:3000
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", locale: "it-IT", timezoneId: "Europe/Rome" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "telefono", use: { ...devices["Pixel 7"] }, grep: /@telefono/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev -p 3000",
        url: `${baseURL}/accesso`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
