import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getYearLeaves, getYearPublicLeaves } from "@/lib/data/leaves";
import { getDepartments } from "@/lib/data/people";
import { getPublicPeople, getSchedulePeople, getStoreCalendar } from "@/lib/data/schedule";
import type { ExportLeave, LeavesExportData } from "@/lib/export/leaves-data";
import { buildLeavesPdf } from "@/lib/export/leaves-pdf";
import { buildLeavesXlsx } from "@/lib/export/leaves-xlsx";
import { parseYearParam } from "@/lib/leaves/plan";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Export del planning ferie: Excel (solo admin, layout a 12 mesi + persone × giorni) e PDF della
 * vista calendario. Il PDF per i dipendenti usa il planning pubblico (Ferie / Assente).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active || profile.must_change_pin) {
    return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  }
  const { year: param } = await params;
  const year = parseYearParam(param, NaN);
  if (Number.isNaN(year)) return NextResponse.json({ error: "Anno non valido." }, { status: 400 });

  const format = request.nextUrl.searchParams.get("formato") === "xlsx" ? "xlsx" : "pdf";
  const departmentId = request.nextUrl.searchParams.get("reparto") || null;
  const admin = profile.role === "admin";
  if (format === "xlsx" && !admin) {
    return NextResponse.json({ error: "Export Excel riservato ai responsabili." }, { status: 403 });
  }

  const supabase = await createClient();
  const [people, departments, calendar] = await Promise.all([
    admin ? getSchedulePeople(supabase) : getPublicPeople(supabase),
    getDepartments(supabase),
    getStoreCalendar(supabase, `${year}-01-01`, `${year}-12-31`),
  ]);
  const leaves: ExportLeave[] = admin
    ? await getYearLeaves(supabase, year)
    : (await getYearPublicLeaves(supabase, year)).map((l) => ({
        profileId: l.profileId,
        date: l.date,
        type: l.kind === "ferie" ? "ferie" : "assente",
        hours: null,
        status: l.status,
      }));

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const deptOrder = new Map(departments.map((d, i) => [d.id, i]));
  const department = departmentId ? deptName.get(departmentId) : undefined;
  const selected = people
    .filter((p) => !department || p.departmentIds.includes(departmentId!))
    // Stesso ordine del foglio: per reparto principale, poi ordine manuale.
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        (deptOrder.get(a.p.primaryDepartmentId ?? "") ?? 99) -
          (deptOrder.get(b.p.primaryDepartmentId ?? "") ?? 99) || a.i - b.i,
    )
    .map(({ p }) => p);
  const ids = new Set(selected.map((p) => p.id));

  const data: LeavesExportData = {
    year,
    title: `Planning ferie ${year}`,
    subtitle: [department, admin ? null : "Planning del negozio"].filter(Boolean).join(" · "),
    audience: admin ? "admin" : "public",
    people: selected.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      departmentName: p.primaryDepartmentId ? (deptName.get(p.primaryDepartmentId) ?? null) : null,
    })),
    leaves: leaves.filter((l) => ids.has(l.profileId)),
    holidays: new Map(calendar.holidays.map((h) => [h.date, h.label])),
  };

  const suffix = department ? `-${department.toLowerCase().replace(/\s+/g, "-")}` : "";
  if (format === "xlsx") {
    const body = await buildLeavesXlsx(data);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ferie-${year}${suffix}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const body = await buildLeavesPdf(data);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ferie-${year}${suffix}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
