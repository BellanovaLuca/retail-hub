import "server-only";
import { addDays, format } from "date-fns";
import { parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";
import { parsePrefs } from "@/lib/delivery";
import { adminIds, notify, notifyEach } from "@/lib/notifications";
import { publishedDayText } from "@/lib/schedule/cells";
import type { PublishedShift } from "@/lib/schedule/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { communicationJobs } from "./communication-jobs";

type Db = ReturnType<typeof createAdminClient>;

export type CronContext = { db: Db; now: Date; today: string; time: string; weekday: number };

export type CronJob = {
  name: string;
  description: string;
  /** Si esegue alla prima chiamata del dispatcher dopo quest'ora (Europe/Rome). */
  after: string;
  /** Giorni ISO 1..7; vuoto = tutti. */
  days?: number[];
  /** Chiave di idempotenza: per default una volta al giorno. */
  key?: (ctx: CronContext) => string;
  run: (ctx: CronContext) => Promise<Record<string, unknown>>;
};

/** Turni pubblicati di un giorno (dall'istantanea delle settimane pubblicate). */
export async function publishedShiftsOn(db: Db, date: string): Promise<PublishedShift[]> {
  const monday = format(weekStart(parseISO(date)), "yyyy-MM-dd");
  const { data } = await db
    .from("schedule_weeks")
    .select("published_shifts")
    .eq("week_start", monday)
    .eq("status", "published")
    .maybeSingle();
  return ((data?.published_shifts ?? []) as unknown as PublishedShift[]).filter(
    (s) => s.date === date,
  );
}

const working = (list: PublishedShift[]) => [
  ...new Set(list.filter((s) => !s.is_absence && s.start_time).map((s) => s.profile_id)),
];

const coreJobs: CronJob[] = [
  {
    name: "promemoria-giornata",
    description:
      "Promemoria delle 19:30 a chi è in turno e non ha compilato i numeri del giorno (§8.3).",
    after: "19:30",
    async run({ db, today }) {
      const people = working(await publishedShiftsOn(db, today));
      if (!people.length) return { sent: 0 };
      const [{ data: filled }, { data: withKpis }] = await Promise.all([
        db.from("daily_entries").select("profile_id").eq("date", today).in("profile_id", people),
        db.from("profile_kpis").select("profile_id").eq("active", true).in("profile_id", people),
      ]);
      const done = new Set((filled ?? []).map((r) => r.profile_id));
      const tracked = new Set((withKpis ?? []).map((r) => r.profile_id));
      const targets = people.filter((p) => tracked.has(p) && !done.has(p));
      await notify(targets, {
        kind: "daily_reminder",
        title: "Compila la giornata",
        body: "Inserisci i tuoi numeri di oggi: bastano pochi secondi.",
        link: "/obiettivi",
      });
      return { sent: targets.length };
    },
  },
  {
    name: "promemoria-turno",
    description: "Promemoria la sera prima del turno, per chi l'ha attivato nel profilo.",
    after: "19:00",
    async run({ db, today }) {
      const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
      const shifts = await publishedShiftsOn(db, tomorrow);
      const people = working(shifts);
      if (!people.length) return { sent: 0 };
      const { data: profiles } = await db
        .from("profiles")
        .select("id, notification_prefs")
        .in("id", people);
      const wanted = (profiles ?? [])
        .filter((p) => parsePrefs(p.notification_prefs).shift_reminder)
        .map((p) => p.id);
      await notifyEach(
        wanted.map((id) => ({
          profileId: id,
          notification: {
            kind: "shift_reminder" as const,
            title: `Domani · ${publishedDayText(shifts.filter((s) => s.profile_id === id))}`,
            body: "Promemoria del tuo turno.",
            link: "/orari",
          },
        })),
      );
      return { sent: wanted.length };
    },
  },
  {
    name: "settimana-non-pubblicata",
    description:
      "Il giovedì avvisa gli admin se la settimana successiva non è ancora pubblicata (§10).",
    after: "09:00",
    days: [4],
    async run({ db, today }) {
      const next = format(addDays(weekStart(parseISO(today)), 7), "yyyy-MM-dd");
      const { data } = await db
        .from("schedule_weeks")
        .select("status")
        .eq("week_start", next)
        .maybeSingle();
      if (data?.status === "published") return { published: true };
      await notify(await adminIds(), {
        kind: "week_unpublished_warning",
        title: "Orari della prossima settimana da pubblicare",
        body: `La settimana del ${format(parseISO(next), "d MMMM", { locale: it })} non è ancora pubblicata.`,
        link: `/admin/turni/${next}`,
      });
      return { published: false };
    },
  },
];

const registry: CronJob[] = [...coreJobs, ...communicationJobs];

export function cronJobs() {
  return registry;
}

export function cronContext(): CronContext {
  const now = nowInRome();
  return {
    db: createAdminClient(),
    now,
    today: toISODate(now),
    time: format(now, "HH:mm"),
    weekday: ((now.getDay() + 6) % 7) + 1,
  };
}

/**
 * Esegue i job dovuti. Ogni job gira al massimo una volta per chiave: il dispatcher può essere
 * chiamato spesso (es. ogni 15 minuti) senza duplicare le notifiche.
 */
export async function runDueJobs(opts: { only?: string; force?: boolean } = {}) {
  const ctx = cronContext();
  const results: Record<string, unknown> = {};
  for (const job of registry) {
    if (opts.only && job.name !== opts.only) continue;
    const due = ctx.time >= job.after && (!job.days?.length || job.days.includes(ctx.weekday));
    if (!due && !opts.force) continue;
    const runKey = job.key ? job.key(ctx) : `${job.name}:${ctx.today}`;
    if (!opts.force) {
      const { error } = await ctx.db.from("cron_runs").insert({ job: job.name, run_key: runKey });
      if (error) {
        results[job.name] = "già eseguito";
        continue;
      }
    }
    try {
      const result = await job.run(ctx);
      results[job.name] = result;
      await ctx.db
        .from("cron_runs")
        .update({ result: result as never })
        .eq("run_key", runKey);
    } catch (error) {
      console.error("cron", job.name, error);
      results[job.name] = { error: String(error) };
      // Si potrà riprovare alla prossima chiamata.
      await ctx.db.from("cron_runs").delete().eq("run_key", runKey);
    }
  }
  return { at: `${ctx.today} ${ctx.time}`, results };
}
