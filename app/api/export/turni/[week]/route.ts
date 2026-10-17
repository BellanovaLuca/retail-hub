import { addDays, format, parseISO } from "date-fns";
import type { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getDepartments } from "@/lib/data/people";
import {
  getAdminWeek,
  getSchedulePeople,
  getStoreCalendar,
  getTemplates,
  normalizeWeekParam,
} from "@/lib/data/schedule";
import { nowInRome } from "@/lib/dates";
import { errorResponse, fileResponse, PDF_TYPE, XLSX_TYPE } from "@/lib/export/http";
import { buildAdminGridModel } from "@/lib/export/schedule-grid";
import { renderGridPdf, renderWeekPdf } from "@/lib/export/schedule-pdf";
import { buildScheduleXlsx } from "@/lib/export/schedule-xlsx";
import { buildTimesheetModel } from "@/lib/export/timesheet-model";
import { withAbsenceShifts } from "@/lib/schedule/view";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Export della versione di LAVORO della settimana (solo admin).
 * `?formato=xlsx` (fogli "Turni" e "Week NN") · `?formato=pdf` (A4 orizzontale) ·
 * `?formato=pdf&layout=week` (A4 verticale, una pagina, come i fogli Week 39/40).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ week: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) return errorResponse(401, "Accedi per scaricare i turni.");
  if (profile.role !== "admin" || profile.must_change_pin || !profile.privacy_accepted_at)
    return errorResponse(403, "Solo gli amministratori possono esportare la versione di lavoro.");

  const formato = request.nextUrl.searchParams.get("formato") ?? "pdf";
  const layout = request.nextUrl.searchParams.get("layout");
  if (formato !== "pdf" && formato !== "xlsx")
    return errorResponse(400, "Formato non valido: usa pdf o xlsx.");

  const { week: param } = await params;
  const weekStart = normalizeWeekParam(param, nowInRome());
  const sunday = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
  const db = await createClient();
  const [data, people, templates, departments, calendar] = await Promise.all([
    getAdminWeek(db, weekStart),
    getSchedulePeople(db),
    getTemplates(db),
    getDepartments(db),
    getStoreCalendar(db, weekStart, sunday),
  ]);
  const deps = departments.map((d) => ({ id: d.id, name: d.name }));
  const timesheet = buildTimesheetModel({
    days: data.days,
    shifts: data.shifts,
    leaves: withAbsenceShifts(data.leaves, data.shifts, new Map(templates.map((t) => [t.id, t]))),
    people,
    departments: deps,
    calendar,
  });
  const name = `turni-week-${String(timesheet.weekNumber).padStart(2, "0")}`;

  if (formato === "pdf" && layout === "week") {
    return fileResponse(await renderWeekPdf(timesheet), PDF_TYPE, `${name}.pdf`);
  }
  const grid = buildAdminGridModel({
    days: data.days,
    shifts: data.shifts,
    leaves: data.leaves,
    people,
    templates,
    departments: deps,
    calendar,
  });
  if (formato === "xlsx") {
    return fileResponse(await buildScheduleXlsx({ grid, timesheet }), XLSX_TYPE, `${name}.xlsx`);
  }
  return fileResponse(await renderGridPdf(grid), PDF_TYPE, `${name}.pdf`);
}
