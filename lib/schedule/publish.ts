import "server-only";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { getAdminWeek, getSchedulePeople, getTemplates } from "@/lib/data/schedule";
import { notify, notifyEach } from "@/lib/notifications";
import type { createClient } from "@/lib/supabase/server";
import { buildSnapshot, type DayChange } from "./cells";
import type { PublishedShift } from "./types";

type Db = Awaited<ReturnType<typeof createClient>>;

function shortDay(date: string) {
  const s = format(parseISO(date), "EEE d", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type PublishResult =
  { ok: true; firstPublish: boolean; changes: number } | { ok: false; message: string };

/**
 * Pubblica la settimana: salva l'istantanea, registra le modifiche e notifica (§5, §10).
 * Con `onlyDays` (chiavi "profileId|data") aggiorna solo quelle giornate e lascia il resto
 * dell'istantanea com'era: serve per rendere visibile subito uno scambio approvato senza
 * pubblicare altre modifiche in bozza.
 */
export async function publishSnapshot(
  db: Db,
  weekStart: string,
  actorId: string,
  opts: { mode: "all" | "changed"; onlyDays?: Set<string> },
): Promise<PublishResult> {
  const data = await getAdminWeek(db, weekStart);
  const { data: week } = await db
    .from("schedule_weeks")
    .select("*")
    .eq("id", data.week.id)
    .single();
  if (!week) return { ok: false, message: "Settimana non trovata." };
  const [templates, people] = await Promise.all([getTemplates(db), getSchedulePeople(db)]);
  const previous = data.week.publishedShifts;
  const firstPublish = week.status !== "published";

  const full = buildSnapshot(
    data.shifts,
    new Map(templates.map((t) => [t.id, t])),
    new Map(people.map((p) => [p.id, p])),
    previous,
  );
  let snapshot: PublishedShift[] = full.snapshot;
  let changes: DayChange[] = full.changes;
  if (opts.onlyDays && !firstPublish) {
    const only = opts.onlyDays;
    const inOnly = (s: { profile_id: string; date: string }) =>
      only.has(`${s.profile_id}|${s.date}`);
    snapshot = [
      ...previous.filter((s) => !inOnly(s)).map((s) => ({ ...s, changed: false })),
      ...full.snapshot.filter(inOnly),
    ];
    changes = full.changes.filter((c) => only.has(`${c.profileId}|${c.date}`));
  }

  const { error } = await db
    .from("schedule_weeks")
    .update({
      status: "published",
      version: week.version + 1,
      published_at: new Date().toISOString(),
      published_by: actorId,
      published_shifts: snapshot,
    })
    .eq("id", week.id);
  if (error) return { ok: false, message: "Pubblicazione non riuscita." };

  if (!firstPublish && changes.length) {
    await db.from("shift_changes").insert(
      changes.map((c) => ({
        profile_id: c.profileId,
        date: c.date,
        before: { text: c.before },
        after: { text: c.after },
        changed_by: actorId,
        notified_at: new Date().toISOString(),
      })),
    );
  }

  const weekLabel = `settimana del ${format(parseISO(weekStart), "d MMMM", { locale: it })}`;
  const link = `/orari?settimana=${weekStart}`;
  if (firstPublish || opts.mode === "all") {
    await notify([...new Set(snapshot.map((s) => s.profile_id))], {
      kind: "week_published",
      title: firstPublish ? "Orari pubblicati" : "Orari aggiornati",
      body: `Sono disponibili i tuoi orari della ${weekLabel}.`,
      link,
    });
  } else {
    const byPerson = new Map<string, DayChange[]>();
    for (const c of changes) byPerson.set(c.profileId, [...(byPerson.get(c.profileId) ?? []), c]);
    await notifyEach(
      [...byPerson].map(([profileId, list]) => ({
        profileId,
        notification: {
          kind: "shift_changed" as const,
          title: "Il tuo orario è cambiato",
          body: list.map((c) => `${shortDay(c.date)}: ${c.before} → ${c.after}`).join("\n"),
          link,
        },
      })),
    );
  }
  return { ok: true, firstPublish, changes: changes.length };
}
