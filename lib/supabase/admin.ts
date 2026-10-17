import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl } from "./env";

/**
 * Client con la service role key: ignora RLS. Solo lato server, solo per
 * creazione utenti, reset PIN, tentativi di accesso e cron.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Variabile d'ambiente mancante: SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
