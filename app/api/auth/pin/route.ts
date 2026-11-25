import { randomBytes } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { beginLoginAttempt, clientIp, markAttemptSucceeded } from "@/lib/auth/attempts";
import { lockoutMessage } from "@/lib/auth/lockout";
import { registerLoginSession } from "@/lib/auth/login-sessions";
import { normalizeEmployeeCode, syntheticEmail } from "@/lib/auth/pin";
import { authPassword } from "@/lib/auth/secret";
import { adminIds, notify } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  code: z.string().trim().min(2).max(20),
  pin: z.string().regex(/^\d{6,12}$/),
});

const WRONG_CREDENTIALS = "Codice o PIN non corretti.";

/**
 * La richiesta deve arrivare dal modulo di accesso dell'app: JSON (un modulo di un altro sito
 * non può inviarlo senza permesso) e, se il browser dichiara l'origine, la stessa dell'app.
 * Così nessuno può far entrare un'altra persona nel PROPRIO account con un link.
 */
function sameOriginJson(request: NextRequest): boolean {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")];
  try {
    return hosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}

/** Accesso con codice dipendente + PIN (§4). */
export async function POST(request: NextRequest) {
  if (!sameOriginJson(request)) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 403 });
  }
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
    .select("id, display_name")
    .eq("employee_code", code)
    .maybeSingle();

  if (!account) {
    // Codice inesistente: stessa strada (una richiesta ad Auth, senza toccare i cookie) e stessa
    // risposta di un PIN sbagliato, così dall'esterno non si distinguono i codici veri.
    const probe = createSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await probe.auth
      .signInWithPassword({
        email: syntheticEmail(code),
        password: randomBytes(24).toString("hex"),
      })
      .catch(() => undefined);
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail(code),
    password: authPassword(account.id, parsed.data.pin),
  });

  if (error || !data.user) {
    // Questo errore ha fatto scattare il blocco: gli admin lo vengono a sapere.
    if (gate.reachedLimit) {
      await notify(await adminIds(), {
        kind: "login_locked",
        title: `Accesso bloccato: ${account.display_name} (${code})`,
        body: "Troppi PIN errati di fila. Se non è stata la persona a sbagliare, generale un nuovo PIN.",
        link: "/admin/dipendenti",
      });
    }
    // Anche per un account disattivato la risposta è quella generica: «disattivato» si dice
    // solo a chi ha dimostrato di conoscere il PIN (più sotto).
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

  // Il database fa valere solo le sessioni aperte da qui (lib/auth/login-sessions).
  try {
    await registerLoginSession(admin, data.user.id, data.session?.access_token);
  } catch (e) {
    console.error(e);
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.json({ error: "Accesso non riuscito. Riprova." }, { status: 503 });
  }

  await markAttemptSucceeded(admin, gate.attemptId);

  const onboarding = profile.must_change_pin || !profile.privacy_accepted_at;
  return NextResponse.json({ redirectTo: onboarding ? "/primo-accesso" : "/" });
}
