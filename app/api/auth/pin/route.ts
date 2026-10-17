import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_PER_CODE,
  MAX_FAILED_PER_IP,
  lockedUntil,
} from "@/lib/auth/lockout";
import { normalizeEmployeeCode, syntheticEmail } from "@/lib/auth/pin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  code: z.string().trim().min(2).max(20),
  pin: z.string().regex(/^\d{6,12}$/),
});

const WRONG_CREDENTIALS = "Codice o PIN non corretti.";

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "sconosciuto"
  );
}

function lockedResponse(until: Date) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return NextResponse.json(
    {
      error: `Troppi tentativi errati. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.`,
    },
    { status: 429 },
  );
}

/** Accesso con codice dipendente + PIN (§4). */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 400 });
  }

  const code = normalizeEmployeeCode(parsed.data.code);
  const ip = clientIp(request);
  const admin = createAdminClient();
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();

  const [byCode, byIp] = await Promise.all([
    admin.from("login_attempts").select("at, success").eq("employee_code", code).gte("at", since),
    admin.from("login_attempts").select("at, success").eq("ip", ip).gte("at", since),
  ]);
  const toAttempts = (rows: { at: string; success: boolean }[] | null) =>
    (rows ?? []).map((r) => ({ at: new Date(r.at), success: r.success }));

  const locked =
    lockedUntil(toAttempts(byCode.data), MAX_FAILED_PER_CODE) ??
    lockedUntil(toAttempts(byIp.data), MAX_FAILED_PER_IP);
  if (locked) return lockedResponse(locked);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail(code),
    password: parsed.data.pin,
  });

  if (error || !data.user) {
    await admin.from("login_attempts").insert({ employee_code: code, ip, success: false });
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("active, must_change_pin, privacy_accepted_at")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.active) {
    await supabase.auth.signOut({ scope: "local" });
    await admin.from("login_attempts").insert({ employee_code: code, ip, success: false });
    return NextResponse.json(
      { error: "Questo account è disattivato. Rivolgiti a un responsabile." },
      { status: 403 },
    );
  }

  await admin.from("login_attempts").insert({ employee_code: code, ip, success: true });

  const onboarding = profile.must_change_pin || !profile.privacy_accepted_at;
  return NextResponse.json({ redirectTo: onboarding ? "/primo-accesso" : "/" });
}
