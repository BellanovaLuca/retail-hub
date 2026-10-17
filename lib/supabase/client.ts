import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SESSION_MAX_AGE_SECONDS } from "./env";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { maxAge: SESSION_MAX_AGE_SECONDS } },
  );
}
