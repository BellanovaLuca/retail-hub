import { NextResponse, type NextRequest } from "next/server";
import { addDays, format } from "date-fns";
import { buildIcs } from "@/lib/ical";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublishedShift } from "@/lib/schedule/types";

/**
 * Feed iCal personale (/api/ical/<token>.ics). Il token segreto sostituisce la sessione:
 * restituisce solo i turni PUBBLICATI della persona, da 4 settimane fa a 12 settimane avanti.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{36}$/.test(token)) return new NextResponse("Non trovato", { status: 404 });

  const db = createAdminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, display_name, active")
    .eq("ical_token", token)
    .maybeSingle();
  if (!profile?.active) return new NextResponse("Non trovato", { status: 404 });

  const from = format(addDays(new Date(), -28), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 84), "yyyy-MM-dd");
  const { data: weeks } = await db
    .from("schedule_weeks")
    .select("published_shifts, published_at")
    .eq("status", "published")
    .gte("week_start", format(addDays(new Date(from), -6), "yyyy-MM-dd"))
    .lte("week_start", to);
  const { data: settings } = await db
    .from("store_settings")
    .select("store_name")
    .eq("id", true)
    .single();

  const shifts = (weeks ?? [])
    .flatMap((w) =>
      (w.published_shifts as unknown as PublishedShift[]).map((s) => ({
        ...s,
        stamp: w.published_at,
      })),
    )
    .filter(
      (s) =>
        s.profile_id === profile.id &&
        s.date >= from &&
        s.date <= to &&
        !s.is_absence &&
        s.start_time &&
        s.end_time,
    );

  const body = buildIcs({
    calendarName: `Turni · ${profile.display_name}`,
    location: settings?.store_name ?? "Salmoiraghi & Viganò — Piazza Cordusio",
    events: shifts.map((s) => ({
      uid: `${s.id}@staff-cordusio`,
      date: s.date,
      start: s.start_time!,
      end: s.end_time!,
      summary: s.is_back_office ? "Turno (back office)" : "Turno",
      description: [s.zone ? `Area: ${s.zone === "vista" ? "Vista" : "Sole"}` : "", s.note ?? ""]
        .filter(Boolean)
        .join("\n"),
      stamp: s.stamp ?? new Date().toISOString(),
    })),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="turni.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
