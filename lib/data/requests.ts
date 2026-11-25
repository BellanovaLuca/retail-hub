import "server-only";
import {
  requestShiftDays,
  type RequestStatus,
  type RequestType,
  type ShiftDay,
} from "@/lib/requests";
import { publishedDayText } from "@/lib/schedule/cells";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { fetchAllRows } from "./paginate";
import { getPublishedDays } from "./schedule";

type Db = Awaited<ReturnType<typeof createClient>>;

export type RequestRow = Tables<"requests">;

export type RequestDetail = RequestRow & {
  requesterName: string;
  targetName: string | null;
  deciderName: string | null;
  comments: {
    id: string;
    authorId: string | null;
    authorName: string;
    body: string;
    createdAt: string;
  }[];
  shift: { date: string; text: string } | null;
  targetShift: { date: string; text: string } | null;
  attachmentUrl: string | null;
};

export async function namesById(db: Db): Promise<Map<string, string>> {
  const { data } = await db.from("public_profiles").select("id, display_name");
  return new Map((data ?? []).map((p) => [p.id!, p.display_name!]));
}

export async function getRequestDetail(db: Db, id: string): Promise<RequestDetail | null> {
  const { data: r } = await db.from("requests").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  const [names, { data: comments }] = await Promise.all([
    namesById(db),
    db.from("request_comments").select("*").eq("request_id", id).order("created_at"),
  ]);

  // I turni della richiesta si cercano per persona + giorno nei turni pubblicati (come fa il
  // trigger dello scambio), non per id: gli id cambiano quando l'admin riscrive una giornata.
  const days = requestShiftDays(r);
  const wanted = [days.shift, days.targetShift].filter((d): d is ShiftDay => d !== null);
  const published = await getPublishedDays(
    db,
    [...new Set(wanted.map((d) => d.profileId))],
    [...new Set(wanted.map((d) => d.date))],
  );
  const shiftText = (day: ShiftDay | null) => {
    if (!day) return null;
    const pieces = published.filter((s) => s.profile_id === day.profileId && s.date === day.date);
    return { date: day.date, text: publishedDayText(pieces, true) || "nessun turno pubblicato" };
  };

  let attachmentUrl: string | null = null;
  if (r.attachment_path) {
    const { data } = await db.storage.from("attachments").createSignedUrl(r.attachment_path, 600);
    attachmentUrl = data?.signedUrl ?? null;
  }

  return {
    ...r,
    requesterName: names.get(r.profile_id) ?? "—",
    targetName: r.target_profile_id ? (names.get(r.target_profile_id) ?? "—") : null,
    deciderName: r.decided_by ? (names.get(r.decided_by) ?? "—") : null,
    comments: (comments ?? []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: c.author_id ? (names.get(c.author_id) ?? "—") : "Sistema",
      body: c.body,
      createdAt: c.created_at,
    })),
    shift: shiftText(days.shift),
    targetShift: shiftText(days.targetShift),
    attachmentUrl,
  };
}

/**
 * Tutte le richieste, di ogni stato, che toccano l'intervallo `from`–`to` (calendario del mese):
 * quelle il cui periodo lo attraversa e gli scambi il cui turno preso in cambio cade lì dentro.
 * Lettura a pagine: in un mese possono superare le 1000 righe.
 */
export async function getRequestsBetween(
  db: Db,
  from: string,
  to: string,
  filters: { type?: RequestType; profileId?: string } = {},
): Promise<RequestRow[]> {
  return fetchAllRows<RequestRow>((start, end) => {
    let query = db
      .from("requests")
      .select("*", { count: "exact" })
      .or(
        `and(start_date.lte.${to},end_date.gte.${from}),and(target_date.gte.${from},target_date.lte.${to})`,
      );
    if (filters.type) query = query.eq("type", filters.type);
    if (filters.profileId) query = query.eq("profile_id", filters.profileId);
    return query.order("start_date").order("id").range(start, end);
  });
}

export function asStatus(s: string) {
  return s as RequestStatus;
}
