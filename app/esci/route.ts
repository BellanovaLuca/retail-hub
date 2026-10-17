import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Chiude la sessione di un account disattivato (o senza profilo) e torna all'accesso. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const url = new URL("/accesso", request.url);
  url.searchParams.set("disattivato", "1");
  return NextResponse.redirect(url);
}
