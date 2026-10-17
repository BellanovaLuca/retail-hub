import { randomInt } from "node:crypto";

/** Dominio delle email sintetiche interne: non compare mai in UI. */
export const SYNTHETIC_EMAIL_DOMAIN = "staff.cordusio.local";

export const EMPLOYEE_PIN_LENGTH = 6;
export const ADMIN_PIN_MIN_LENGTH = 8;

export type Role = "admin" | "employee";

/** Normalizza un codice dipendente digitato a mano: " crd 14 " → "CRD-14". */
export function normalizeEmployeeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function isValidEmployeeCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code);
}

export function syntheticEmail(code: string): string {
  return `${normalizeEmployeeCode(code).toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/** Codice proposto alla creazione di un dipendente: CRD-001, CRD-002, … */
export function nextEmployeeCode(existing: string[], prefix = "CRD"): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existing.reduce((acc, code) => {
    const match = pattern.exec(code);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function isAllSame(pin: string) {
  return /^(\d)\1+$/.test(pin);
}

function isSequence(pin: string) {
  const digits = [...pin].map(Number);
  const step = digits[1] - digits[0];
  if (Math.abs(step) !== 1) return false;
  return digits.every((d, i) => i === 0 || d - digits[i - 1] === step);
}

/** 121212, 123123, 12341234: un blocco corto ripetuto. */
function isRepeatedBlock(pin: string) {
  for (let size = 2; size <= pin.length / 2; size++) {
    if (pin.length % size !== 0) continue;
    if (pin.slice(0, size).repeat(pin.length / size) === pin) return true;
  }
  return false;
}

function isValidDayMonth(day: number, month: number) {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Date "ovvie" all'italiana: GGMMAA (6 cifre), GGMMAAAA o AAAAMMGG (8 cifre). */
function isObviousDate(pin: string) {
  if (pin.length === 6) {
    return isValidDayMonth(Number(pin.slice(0, 2)), Number(pin.slice(2, 4)));
  }
  if (pin.length === 8) {
    const ddmmyyyy =
      isValidDayMonth(Number(pin.slice(0, 2)), Number(pin.slice(2, 4))) &&
      /^(19|20)\d\d$/.test(pin.slice(4));
    const yyyymmdd =
      /^(19|20)\d\d$/.test(pin.slice(0, 4)) &&
      isValidDayMonth(Number(pin.slice(6, 8)), Number(pin.slice(4, 6)));
    return ddmmyyyy || yyyymmdd;
  }
  return false;
}

export function isTrivialPin(pin: string): boolean {
  return isAllSame(pin) || isSequence(pin) || isRepeatedBlock(pin) || isObviousDate(pin);
}

export function pinRequirement(role: Role): string {
  return role === "admin" ? `almeno ${ADMIN_PIN_MIN_LENGTH} cifre` : `${EMPLOYEE_PIN_LENGTH} cifre`;
}

/** Restituisce il messaggio d'errore da mostrare, o null se il PIN va bene. */
export function validateNewPin(pin: string, role: Role): string | null {
  if (!/^\d+$/.test(pin)) return "Il PIN deve contenere solo cifre.";
  if (role === "admin" && pin.length < ADMIN_PIN_MIN_LENGTH) {
    return `Il PIN degli amministratori deve avere ${pinRequirement(role)}.`;
  }
  if (role === "employee" && pin.length !== EMPLOYEE_PIN_LENGTH) {
    return `Il PIN deve avere ${pinRequirement(role)}.`;
  }
  if (isTrivialPin(pin)) {
    return "PIN troppo facile da indovinare: evita cifre ripetute, sequenze e date.";
  }
  return null;
}

/** PIN provvisorio casuale, mai banale. */
export function generatePin(role: Role): string {
  const length = role === "admin" ? ADMIN_PIN_MIN_LENGTH : EMPLOYEE_PIN_LENGTH;
  for (;;) {
    const pin = Array.from({ length }, () => randomInt(0, 10)).join("");
    if (!isTrivialPin(pin)) return pin;
  }
}

/** Testo da mandare al dipendente con il link al sito, il codice e il PIN provvisorio. */
export function credentialsMessage(opts: {
  appUrl: string;
  displayName: string;
  code: string;
  pin: string;
}): string {
  return [
    `Ciao ${opts.displayName}!`,
    `Ecco l'accesso al portale staff di Cordusio: ${opts.appUrl}`,
    `Codice: ${opts.code}`,
    `PIN provvisorio: ${opts.pin}`,
    `Al primo accesso ti verrà chiesto di scegliere un PIN personale.`,
  ].join("\n");
}
