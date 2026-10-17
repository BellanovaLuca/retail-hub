import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDueJobs } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Confronto a tempo costante del bearer con CRON_SECRET. */
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Dispatcher dei job pianificati (§10). Protetto da CRON_SECRET (Vercel Cron lo invia da sé
 * come "Authorization: Bearer …"). Parametri facoltativi: ?job=<nome>&force=1 per i test.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const job = request.nextUrl.searchParams.get("job") ?? undefined;
  const force = request.nextUrl.searchParams.get("force") === "1";
  return NextResponse.json(await runDueJobs({ only: job, force }));
}

export const POST = GET;
