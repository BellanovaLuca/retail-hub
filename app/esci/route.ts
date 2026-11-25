import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Chiude la sessione di un account disattivato (o senza profilo) e torna all'accesso.
 * Chi ha un profilo attivo NON viene disconnesso: un link a /esci messo da qualcuno in un
 * messaggio non deve far uscire un utente in regola (l'uscita vera passa dal pulsante «Esci»).
 */
export async function GET(request: NextRequest) {
  let active = false;
  try {
    active = Boolean((await getCurrentProfile())?.active);
  } catch {
    // Profilo non leggibile per un guasto momentaneo: non si chiude la sessione.
    active = true;
  }
  if (active) return NextResponse.redirect(new URL("/", request.url));

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const url = new URL("/accesso", request.url);
  url.searchParams.set("disattivato", "1");
  return NextResponse.redirect(url);
}
