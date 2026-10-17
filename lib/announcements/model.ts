/**
 * Comunicazioni: tipi, etichette e logica pura (destinatari, ordinamento del feed, date).
 * Nessun accesso al database: si usa sia lato server sia nei componenti client.
 */
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { z } from "zod";

export const CATEGORIES = [
  "generale",
  "turni",
  "ferie",
  "vendite",
  "formazione",
  "urgente",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const categoryLabels: Record<Category, string> = {
  generale: "Generale",
  turni: "Turni",
  ferie: "Ferie",
  vendite: "Vendite",
  formazione: "Formazione",
  urgente: "Urgente",
};

export type Audience = "all" | "department" | "people";

export const audienceLabels: Record<Audience, string> = {
  all: "Tutti",
  department: "Reparti",
  people: "Persone",
};

/** Allegato salvato nel bucket `attachments`. */
export type Attachment = { path: string; name: string; size: number; type?: string };

export const attachmentSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  size: z.number().int().nonnegative(),
  type: z.string().max(100).optional(),
});

/** Legge in modo tollerante la colonna jsonb `attachments`. */
export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const parsed = attachmentSchema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

/** Nome di file sicuro per il percorso nello Storage. */
export function storageFileName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|-+$/g, "");
  return clean.slice(-80) || "file";
}

export type AudienceFields = {
  audience: Audience;
  department_ids: string[];
  profile_ids: string[];
};

/** Stessa regola della funzione SQL `is_announcement_recipient`. */
export function isRecipient(
  a: AudienceFields,
  person: { id: string; departmentIds: string[] },
): boolean {
  switch (a.audience) {
    case "all":
      return true;
    case "people":
      return a.profile_ids.includes(person.id);
    case "department":
      return person.departmentIds.some((d) => a.department_ids.includes(d));
  }
}

/** Visibile adesso: già pubblicata e non scaduta. */
export function isLive(
  a: { publish_at: string; expires_at: string | null },
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  return (
    new Date(a.publish_at).getTime() <= t && (!a.expires_at || new Date(a.expires_at).getTime() > t)
  );
}

export type ReadState = { read: boolean; acknowledged: boolean };

/** Richiede ancora un'azione: non letta, oppure da confermare e non confermata. */
export function needsAttention(a: { requires_ack: boolean }, s: ReadState): boolean {
  return !s.read || (a.requires_ack && !s.acknowledged);
}

/** Urgente o da confermare, e non ancora "chiusa" da chi legge. */
export function isPriority(a: { category: string; requires_ack: boolean }, s: ReadState): boolean {
  if (a.requires_ack && !s.acknowledged) return true;
  return a.category === "urgente" && !s.read;
}

type FeedItem = {
  pinned: boolean;
  category: string;
  requires_ack: boolean;
  publish_at: string;
} & ReadState;

/**
 * Ordine della bacheca: le fissate in alto; poi le urgenti e le da confermare non lette;
 * poi le altre, dalla più recente.
 */
export function orderFeed<T extends FeedItem>(items: T[]): T[] {
  const rank = (a: T) => (a.pinned ? 0 : isPriority(a, a) ? 1 : 2);
  return [...items].sort((x, y) => rank(x) - rank(y) || (x.publish_at < y.publish_at ? 1 : -1));
}

/** Ordine per la Home: prima urgenti e da confermare, poi le fissate, poi per data. */
export function orderUnread<T extends FeedItem>(items: T[]): T[] {
  const rank = (a: T) => (isPriority(a, a) ? 0 : a.pinned ? 1 : 2);
  return [...items].sort((x, y) => rank(x) - rank(y) || (x.publish_at < y.publish_at ? 1 : -1));
}

export const ROME = "Europe/Rome";

/** Valore per <input type="datetime-local"> nell'ora di Roma. */
export function toRomeLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new TZDate(iso, ROME), "yyyy-MM-dd'T'HH:mm");
}

/** Interpreta "yyyy-MM-ddTHH:mm" come ora di Roma e restituisce l'istante ISO (UTC). */
export function fromRomeLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new TZDate(y, mo - 1, d, h, mi, ROME);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime()).toISOString();
}

/** Data e ora leggibili nel fuso del negozio, es. "mer 14 ott · 09:30". */
export function formatRomeDateTime(iso: string, withTime = true): string {
  const date = new TZDate(iso, ROME);
  return format(date, withTime ? "EEE d MMM · HH:mm" : "EEE d MMM yyyy", {
    locale: itLocale,
  });
}

/** Dati dell'editor (admin). */
export const announcementInputSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, "Scrivi un titolo.").max(200, "Titolo troppo lungo."),
    body: z.string().max(20000, "Testo troppo lungo."),
    category: z.enum(CATEGORIES),
    audience: z.enum(["all", "department", "people"]),
    departmentIds: z.array(z.uuid()).max(50),
    profileIds: z.array(z.uuid()).max(500),
    pinned: z.boolean(),
    requiresAck: z.boolean(),
    /** "yyyy-MM-ddTHH:mm" ora di Roma; vuoto = subito. */
    publishAt: z.string().max(20),
    expiresAt: z.string().max(20),
    attachments: z.array(attachmentSchema).max(20),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "department" && v.departmentIds.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["departmentIds"],
        message: "Scegli almeno un reparto.",
      });
    if (v.audience === "people" && v.profileIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["profileIds"], message: "Scegli almeno una persona." });
    if (v.publishAt && !fromRomeLocalInput(v.publishAt))
      ctx.addIssue({ code: "custom", path: ["publishAt"], message: "Data non valida." });
    if (v.expiresAt) {
      const exp = fromRomeLocalInput(v.expiresAt);
      if (!exp) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Data non valida." });
      const pub = v.publishAt ? fromRomeLocalInput(v.publishAt) : new Date().toISOString();
      if (exp && pub && exp <= pub)
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: "La scadenza deve venire dopo la pubblicazione.",
        });
    }
  });

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
