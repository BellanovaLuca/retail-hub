import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isLive,
  isRecipient,
  needsAttention,
  orderFeed,
  orderUnread,
  parseAttachments,
  type Attachment,
  type Audience,
  type Category,
} from "@/lib/announcements/model";
import { markdownToText } from "@/lib/markdown";
import type { Database, Tables } from "@/lib/supabase/types";

type Db = SupabaseClient<Database>;
type AnnouncementRow = Tables<"announcements">;

export type Person = {
  id: string;
  displayName: string;
  color: string | null;
  active: boolean;
  departmentIds: string[];
  primaryDepartmentId: string | null;
};

/** Elenco delle persone come lo vede chiunque (vista public_profiles). */
export async function getPeopleDirectory(
  db: Db,
  opts: { includeInactive?: boolean } = {},
): Promise<Person[]> {
  let query = db.from("public_profiles").select("*");
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data } = await query.order("sort_order").order("display_name");
  return (data ?? []).map((p) => ({
    id: p.id!,
    displayName: p.display_name ?? "—",
    color: p.color,
    active: p.active ?? false,
    departmentIds: p.department_ids ?? [],
    primaryDepartmentId: p.primary_department_id,
  }));
}

/** Destinatari attivi di una comunicazione (l'autore escluso). */
export function recipientsOf(
  a: Pick<AnnouncementRow, "audience" | "department_ids" | "profile_ids" | "author_id">,
  people: Person[],
): Person[] {
  return people.filter((p) => p.active && p.id !== a.author_id && isRecipient(a, p));
}

export type FeedEntry = {
  id: string;
  title: string;
  bodyMd: string;
  excerpt: string;
  category: Category;
  pinned: boolean;
  requires_ack: boolean;
  publish_at: string;
  expiresAt: string | null;
  authorName: string | null;
  attachments: Attachment[];
  read: boolean;
  acknowledged: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
};

/**
 * Comunicazioni visibili a una persona adesso. RLS limita già i dipendenti; il filtro qui
 * vale anche per gli admin (che in tabella vedono tutto, comprese le programmate).
 */
async function visibleAnnouncements(db: Db, profileId: string, limit = 300) {
  const now = new Date();
  const nowIso = now.toISOString();
  const [{ data: rows }, { data: me }, { data: reads }] = await Promise.all([
    db
      .from("announcements")
      .select("*")
      .lte("publish_at", nowIso)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("publish_at", { ascending: false })
      .limit(limit),
    db.from("public_profiles").select("department_ids").eq("id", profileId).maybeSingle(),
    db
      .from("announcement_reads")
      .select("announcement_id, read_at, acknowledged_at")
      .eq("profile_id", profileId),
  ]);
  const person = { id: profileId, departmentIds: me?.department_ids ?? [] };
  const readMap = new Map((reads ?? []).map((r) => [r.announcement_id, r]));
  const list = (rows ?? []).filter((a) => isLive(a, now) && isRecipient(a, person));
  return { list, readMap };
}

async function authorNames(db: Db, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await db.from("public_profiles").select("id, display_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id!, p.display_name ?? "—"]));
}

function toEntry(
  a: AnnouncementRow,
  read: { read_at: string; acknowledged_at: string | null } | undefined,
  authors: Map<string, string>,
): FeedEntry {
  return {
    id: a.id,
    title: a.title,
    bodyMd: a.body_md,
    excerpt: markdownToText(a.body_md).slice(0, 220),
    category: a.category,
    pinned: a.pinned,
    requires_ack: a.requires_ack,
    publish_at: a.publish_at,
    expiresAt: a.expires_at,
    authorName: a.author_id ? (authors.get(a.author_id) ?? null) : null,
    attachments: parseAttachments(a.attachments),
    read: !!read,
    acknowledged: !!read?.acknowledged_at,
    readAt: read?.read_at ?? null,
    acknowledgedAt: read?.acknowledged_at ?? null,
  };
}

/** Bacheca: filtro per categoria e ricerca testuale (titolo, testo, autore). */
export async function getFeed(
  db: Db,
  profileId: string,
  opts: { category?: Category | null; q?: string | null } = {},
): Promise<FeedEntry[]> {
  const { list, readMap } = await visibleAnnouncements(db, profileId);
  const authors = await authorNames(
    db,
    list.map((a) => a.author_id),
  );
  let entries = list.map((a) => toEntry(a, readMap.get(a.id), authors));
  if (opts.category) entries = entries.filter((e) => e.category === opts.category);
  const q = opts.q?.trim().toLocaleLowerCase("it-IT");
  if (q) {
    entries = entries.filter((e) =>
      [e.title, markdownToText(e.bodyMd), e.authorName ?? ""].some((t) =>
        t.toLocaleLowerCase("it-IT").includes(q),
      ),
    );
  }
  return orderFeed(entries);
}

/** Una comunicazione per chi la legge (null se non visibile). */
export async function getAnnouncementForReader(
  db: Db,
  id: string,
  profileId: string,
): Promise<FeedEntry | null> {
  const [{ data: a }, { data: me }, { data: read }] = await Promise.all([
    db.from("announcements").select("*").eq("id", id).maybeSingle(),
    db.from("public_profiles").select("department_ids").eq("id", profileId).maybeSingle(),
    db
      .from("announcement_reads")
      .select("read_at, acknowledged_at")
      .eq("announcement_id", id)
      .eq("profile_id", profileId)
      .maybeSingle(),
  ]);
  if (!a) return null;
  if (!isLive(a) || !isRecipient(a, { id: profileId, departmentIds: me?.department_ids ?? [] }))
    return null;
  const authors = await authorNames(db, [a.author_id]);
  return toEntry(a, read ?? undefined, authors);
}

export type UnreadAnnouncement = {
  id: string;
  title: string;
  category: Category;
  pinned: boolean;
  requiresAck: boolean;
  /** Letta ma ancora da confermare con "Ho letto". */
  read: boolean;
  publishAt: string;
  href: string;
};

/**
 * Per la Home: comunicazioni che chiedono ancora un'azione (non lette, oppure da confermare
 * e non confermate), con il conteggio totale e le prime 3: urgenti e da confermare in testa.
 */
export async function getUnreadAnnouncements(
  db: Db,
  profileId: string,
): Promise<{ count: number; items: UnreadAnnouncement[] }> {
  const { list, readMap } = await visibleAnnouncements(db, profileId);
  const pending = list
    .map((a) => {
      const r = readMap.get(a.id);
      return { ...a, read: !!r, acknowledged: !!r?.acknowledged_at };
    })
    .filter((a) => needsAttention(a, a));
  const ordered = orderUnread(pending);
  return {
    count: ordered.length,
    items: ordered.slice(0, 3).map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      pinned: a.pinned,
      requiresAck: a.requires_ack,
      read: a.read,
      publishAt: a.publish_at,
      href: `/comunicazioni/${a.id}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type RecipientStatus = {
  profileId: string;
  name: string;
  color: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
};

export type AdminAnnouncement = {
  id: string;
  title: string;
  category: Category;
  audience: Audience;
  audienceLabel: string;
  pinned: boolean;
  requiresAck: boolean;
  publishAt: string;
  expiresAt: string | null;
  notifiedAt: string | null;
  authorName: string | null;
  attachmentsCount: number;
  status: "scheduled" | "live" | "expired";
  recipients: RecipientStatus[];
  readCount: number;
  ackCount: number;
};

/** Elenco per l'admin, con le letture di ogni destinatario. */
export async function getAdminAnnouncements(db: Db): Promise<AdminAnnouncement[]> {
  const [{ data: rows }, people, { data: reads }, { data: departments }] = await Promise.all([
    db.from("announcements").select("*").order("publish_at", { ascending: false }).limit(200),
    getPeopleDirectory(db, { includeInactive: true }),
    db.from("announcement_reads").select("announcement_id, profile_id, read_at, acknowledged_at"),
    db.from("departments").select("id, name"),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const readsBy = new Map<
    string,
    Map<string, { read_at: string; acknowledged_at: string | null }>
  >();
  for (const r of reads ?? []) {
    const m = readsBy.get(r.announcement_id) ?? new Map();
    m.set(r.profile_id, r);
    readsBy.set(r.announcement_id, m);
  }
  const now = new Date();

  return (rows ?? []).map((a) => {
    const readMap = readsBy.get(a.id) ?? new Map();
    const recipients = recipientsOf(a, people).map((p) => {
      const r = readMap.get(p.id);
      return {
        profileId: p.id,
        name: p.displayName,
        color: p.color,
        readAt: r?.read_at ?? null,
        acknowledgedAt: r?.acknowledged_at ?? null,
      };
    });
    const status =
      new Date(a.publish_at) > now
        ? "scheduled"
        : a.expires_at && new Date(a.expires_at) <= now
          ? "expired"
          : "live";
    const audienceLabel =
      a.audience === "all"
        ? "Tutti"
        : a.audience === "department"
          ? a.department_ids.map((d) => deptName.get(d) ?? "—").join(", ")
          : a.profile_ids.map((p) => byId.get(p)?.displayName ?? "—").join(", ");
    return {
      id: a.id,
      title: a.title,
      category: a.category,
      audience: a.audience,
      audienceLabel,
      pinned: a.pinned,
      requiresAck: a.requires_ack,
      publishAt: a.publish_at,
      expiresAt: a.expires_at,
      notifiedAt: a.notified_at,
      authorName: a.author_id ? (byId.get(a.author_id)?.displayName ?? null) : null,
      attachmentsCount: parseAttachments(a.attachments).length,
      status,
      recipients,
      readCount: recipients.filter((r) => r.readAt).length,
      ackCount: recipients.filter((r) => r.acknowledgedAt).length,
    } satisfies AdminAnnouncement;
  });
}
