import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { SESSION_MAX_AGE_SECONDS, supabaseAnonKey, supabaseUrl } from "./env";

/** Client Supabase con la sessione dell'utente (Server Components, Server Actions, Route Handlers). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: { maxAge: SESSION_MAX_AGE_SECONDS },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chiamato da un Server Component: i cookie li aggiorna il middleware.
        }
      },
    },
  });
}
