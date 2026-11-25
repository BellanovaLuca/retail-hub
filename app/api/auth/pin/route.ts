import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { beginLoginAttempt, clientIp, markAttemptSucceeded } from "@/lib/auth/attempts";
import { lockoutMessage } from "@/lib/auth/lockout";
import { normalizeEmployeeCode, syntheticEmail } from "@/lib/auth/pin";
import { authPassword } from "@/lib/auth/secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  code: z.string().trim().min(2).max(20),
  pin: z.string().regex(/^\d{6,12}$/),
});

const WRONG_CREDENTIALS = "Codice o PIN non corretti.";

/** Accesso con codice dipendente + PIN (§4). */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 400 });
  }

  const code = normalizeEmployeeCode(parsed.data.code);
  const ip = clientIp(request.headers);
  const admin = createAdminClient();

  // Controllo del blocco e registrazione del tentativo in un solo passo: il tentativo nasce
  // «fallito» e diventa riuscito solo in fondo. Richieste in parallelo non aggirano la soglia.
  const gate = await beginLoginAttempt(admin, code, ip);
  if (!gate.ok) {
    return NextResponse.json({ error: lockoutMessage(gate.lockedUntil) }, { status: 429 });
  }

  // Il PIN non è la password di Supabase: lo è la sua impronta legata all'utente (lib/auth/secret).
  const { data: account } = await admin
    .from("profiles")
    .select("id")
    .eq("employee_code", code)
    .maybeSingle();
  const supabase = await createClient();
  const { data, error } = account
    ? await supabase.auth.signInWithPassword({
        email: syntheticEmail(code),
        password: authPassword(account.id, parsed.data.pin),
      })
    : { data: { user: null }, error: new Error("account inesistente") };

  if (error || !data.user) {
    // Account disattivato (bannato in Supabase Auth): messaggio chiaro invece di quello generico.
    if (error && "code" in error && error.code === "user_banned") {
      return NextResponse.json(
        { error: "Questo account è disattivato. Rivolgiti a un responsabile." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("active, must_change_pin, privacy_accepted_at")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.active) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.json(
      { error: "Questo account è disattivato. Rivolgiti a un responsabile." },
      { status: 403 },
    );
  }

  await markAttemptSucceeded(admin, gate.attemptId);

  const onboarding = profile.must_change_pin || !profile.privacy_accepted_at;
  return NextResponse.json({ redirectTo: onboarding ? "/primo-accesso" : "/" });
}
