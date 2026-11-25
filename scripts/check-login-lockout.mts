// pnpm check:lockout — prova di concorrenza del blocco dei tentativi di accesso.
// Lancia N chiamate IN PARALLELO a login_attempt_begin (la stessa funzione usata da
// /api/auth/pin) per lo stesso codice: ne devono passare al massimo MAX_FAILED_PER_CODE.
// Solo sullo stack locale: scrive (e poi cancella) righe di prova in login_attempts.
import { LOCKOUT_MINUTES, MAX_FAILED_PER_CODE, MAX_FAILED_PER_IP } from "../lib/auth/lockout";
import { adminClient, isLocalUrl, loadEnv } from "./lib";

loadEnv();

if (!isLocalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("check:lockout va eseguito solo sullo stack locale (localhost).");
  process.exit(1);
}

const PARALLEL = Number(process.argv[2] ?? 40);
const db = adminClient();
const run = Date.now().toString(36).toUpperCase();
let failed = false;

async function burst(label: string, attempts: { code: string; ip: string }[], expectedMax: number) {
  const results = await Promise.all(
    attempts.map((a) =>
      db.rpc("login_attempt_begin", {
        p_code: a.code,
        p_ip: a.ip,
        p_max_code: MAX_FAILED_PER_CODE,
        p_max_ip: MAX_FAILED_PER_IP,
        p_minutes: LOCKOUT_MINUTES,
      }),
    ),
  );
  const errors = results.filter((r) => r.error);
  if (errors.length) throw new Error(`${label}: ${errors[0].error!.message}`);
  const gates = results.map(
    (r) => r.data as { attempt_id: string | null; locked_until: string | null },
  );
  const passed = gates.filter((g) => g.attempt_id).length;
  const locked = gates.filter((g) => g.locked_until).length;
  const ok = passed === expectedMax && passed + locked === attempts.length;
  if (!ok) failed = true;
  console.log(
    `${ok ? "OK      " : "FALLITO "} ${label}: ${attempts.length} richieste in parallelo → ` +
      `${passed} valutate, ${locked} bloccate (attese ${expectedMax} valutate)`,
  );
}

const code = `TEST-${run}`;
const ipA = `test-${run}-a`;
const ipB = `test-${run}-b`;
try {
  // Stesso codice, IP diversi per ogni richiesta: decide la soglia per codice.
  await burst(
    "per codice",
    Array.from({ length: PARALLEL }, (_, i) => ({ code, ip: `${ipA}-${i}` })),
    MAX_FAILED_PER_CODE,
  );
  // Stesso IP, un codice diverso per ogni richiesta: decide la soglia per IP.
  await burst(
    "per IP",
    Array.from({ length: PARALLEL }, (_, i) => ({ code: `${code}-${i}`, ip: ipB })),
    Math.min(PARALLEL, MAX_FAILED_PER_IP),
  );
} finally {
  await db.from("login_attempts").delete().like("employee_code", `${code}%`);
}

process.exit(failed ? 1 : 0);
