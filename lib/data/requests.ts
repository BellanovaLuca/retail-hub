import "server-only";
import type { RequestStatus } from "@/lib/requests";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

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

  async function shiftText(shiftId: string | null) {
    if (!shiftId) return null;
    const { data } = await db
      .from("published_shifts")
      .select("date, start_time, end_time")
      .eq("id", shiftId)
      .limit(1);
    const s = data?.[0];
    if (!s?.date) return null;
    return {
      date: s.date,
      text:
        s.start_time && s.end_time
          ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`
          : "Assenza",
    };
  }

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
    shift: await shiftText(r.shift_id),
    targetShift: await shiftText(r.target_shift_id),
    attachmentUrl,
  };
}

export function asStatus(s: string) {
  return s as RequestStatus;
}
