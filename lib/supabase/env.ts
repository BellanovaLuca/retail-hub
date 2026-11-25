function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name} (vedi .env.example)`);
  return value;
}

// Le variabili NEXT_PUBLIC_* vanno lette per nome esteso, perché Next le sostituisce in fase di build.
export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Sessione lunga sul telefono personale (§4): durata del cookie e limite dall'accesso. */
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-age";

export { SESSION_MAX_AGE_SECONDS };

/**
 * Opzioni dei cookie di sessione. `secure` quando il progetto Supabase è su https (produzione e
 * anteprime): i token non viaggiano mai su una richiesta in chiaro. In locale (http) no.
 */
export const sessionCookieOptions = () => ({
  maxAge: SESSION_MAX_AGE_SECONDS,
  secure: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
});
