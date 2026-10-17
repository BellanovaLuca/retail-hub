import { expect, type Page } from "@playwright/test";

export const ADMIN = { code: "ADM-001", pin: process.env.E2E_ADMIN_PIN ?? "39182746" };

/** Accesso con codice + PIN; completa il primo accesso se richiesto. */
export async function login(page: Page, code: string, pin: string, newPin?: string) {
  await page.goto("/accesso");
  await page.fill("#code", code);
  await page.fill("#pin", pin);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/accesso"));
  if (page.url().includes("/primo-accesso")) {
    if (!newPin) throw new Error(`Serve un nuovo PIN per ${code}`);
    await page.fill("#pin", newPin);
    await page.fill("#confirm", newPin);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Salva e continua" }).click();
    await page.getByRole("button", { name: "Avanti" }).click();
    await page.getByRole("button", { name: "Inizia" }).click();
    await page.waitForURL("/");
  }
}

export function uniqueSuffix() {
  return Date.now().toString(36).slice(-5).toUpperCase();
}

/** Un PIN non banale e diverso a ogni esecuzione. */
export function freshPin(length = 6) {
  for (;;) {
    const pin = Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
    if (!/^(\d)\1+$/.test(pin) && !"0123456789".includes(pin) && !"9876543210".includes(pin)) {
      const dd = Number(pin.slice(0, 2));
      const mm = Number(pin.slice(2, 4));
      if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12)) return pin;
    }
  }
}

export async function expectNoServerErrors(page: Page, run: () => Promise<void>) {
  const errors: string[] = [];
  const onResponse = (r: { status: () => number; url: () => string }) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  };
  page.on("response", onResponse);
  await run();
  page.off("response", onResponse);
  expect(errors).toEqual([]);
}
