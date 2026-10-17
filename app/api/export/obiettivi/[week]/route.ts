import { getCurrentProfile } from "@/lib/auth/session";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { getAdminTargetsWeek, targetsByPerson } from "@/lib/data/targets";
import { nowInRome } from "@/lib/dates";
import { errorResponse, fileResponse, XLSX_TYPE } from "@/lib/export/http";
import { buildTargetsExportModel } from "@/lib/export/targets-model";
import { buildTargetsXlsx } from "@/lib/export/targets-xlsx";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Export Excel degli obiettivi individuali della settimana (solo admin), nel layout del file
 * "OBIETTIVI INDIVIDUALI": fogli Vista e Sole, un blocco per persona.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ week: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) return errorResponse(401, "Accedi per scaricare il file.");
  if (profile.role !== "admin" || profile.must_change_pin || !profile.privacy_accepted_at)
    return errorResponse(403, "Solo gli amministratori possono esportare gli obiettivi.");

  const { week: param } = await params;
  const weekStart = normalizeWeekParam(param, nowInRome());
  const data = await getAdminTargetsWeek(await createClient(), weekStart);

  // Nel file: chi ha obiettivi o numeri in settimana (se nessuno, tutte le persone con voci).
  const involved = new Set([
    ...data.targets.map((t) => t.profileId),
    ...data.entries.map((e) => e.profileId!),
  ]);
  const people = data.people.filter((p) =>
    involved.size ? involved.has(p.profileId) : p.kpis.length > 0,
  );

  const comments: Record<string, Record<string, string>> = {};
  for (const c of data.comments) {
    if (!c.body) continue;
    comments[c.profileId] ??= {};
    comments[c.profileId][c.kpiId ?? "general"] = c.body;
  }

  const model = buildTargetsExportModel({
    weekStart,
    people: people.map((p) => ({
      profileId: p.profileId,
      name: p.name,
      zone: p.zone,
      kpis: p.kpis.map((k) => ({ kpiId: k.kpiId, code: k.code, label: k.label })),
    })),
    entries: data.entries,
    targets: targetsByPerson(data.targets),
    comments,
    notes: data.notes,
  });
  const name = `obiettivi-week-${String(model.weekNumber).padStart(2, "0")}.xlsx`;
  return fileResponse(await buildTargetsXlsx(model), XLSX_TYPE, name);
}
