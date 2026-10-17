import "server-only";
import { createHash } from "node:crypto";

/**
 * Il PIN non è mai la password di Supabase Auth: lo è un'impronta di PIN + utente + segreto
 * del server (PIN_PEPPER). Così chi conosce la chiave pubblica non può provare i PIN
 * chiamando direttamente Supabase e aggirare il blocco dei tentativi di /api/auth/pin.
 * L'impronta dipende dall'id dell'utente, non dal codice: cambiare codice non cambia il PIN.
 */
export function authPassword(userId: string, pin: string): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error("PIN_PEPPER non impostato: vedi .env.example.");
  return createHash("sha256").update(`${pepper}\n${userId}\n${pin}`).digest("hex");
}
