import { addDays, format, parseISO } from "date-fns";
import { getCurrentProfile } from "@/lib/auth/session";
import { getDepartments } from "@/lib/data/people";
import {
  getPublicLeaves,
  getPublicPeople,
  getPublishedShifts,
  getStoreCalendar,
  normalizeWeekParam,
  weekDates,
} from "@/lib/data/schedule";
import { nowInRome, weekNumber } from "@/lib/dates";
import { errorResponse, fileResponse, PDF_TYPE } from "@/lib/export/http";
import { buildPublishedGridModel } from "@/lib/export/schedule-grid";
import { renderGridPdf } from "@/lib/export/schedule-pdf";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PDF A4 orizzontale della griglia PUBBLICATA del negozio, per qualsiasi utente collegato
 * (pagina /orari/negozio). Le assenze compaiono come "Ferie" o "Assente", mai con il motivo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ week: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active || profile.must_change_pin || !profile.privacy_accepted_at)
    return errorResponse(401, "Accedi per scaricare i turni.");

  const { week: param } = await params;
  const weekStart = normalizeWeekParam(param, nowInRome());
  const days = weekDates(weekStart);
  const sunday = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
  const db = await createClient();

  const { data: week } = await db
    .from("schedule_weeks")
    .select("version, status")
    .eq("week_start", weekStart)
    .eq("status", "published")
    .maybeSingle();
  if (!week) return errorResponse(404, "Gli orari di questa settimana non sono ancora pubblicati.");

  const [shifts, people, leaves, departments, calendar] = await Promise.all([
    getPublishedShifts(db, weekStart, sunday),
    getPublicPeople(db),
    getPublicLeaves(db, weekStart, sunday),
    getDepartments(db),
    getStoreCalendar(db, weekStart, sunday),
  ]);
  const model = buildPublishedGridModel({
    days,
    shifts,
    leaves,
    people,
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    calendar,
    version: week.version,
  });
  const n = String(weekNumber(parseISO(weekStart))).padStart(2, "0");
  return fileResponse(await renderGridPdf(model), PDF_TYPE, `turni-week-${n}.pdf`);
}
