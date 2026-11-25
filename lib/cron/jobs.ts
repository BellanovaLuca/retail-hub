import "server-only";
import { addDays, format } from "date-fns";
import { parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";
import { parsePrefs } from "@/lib/delivery";
import { getMissingCompilers } from "@/lib/data/targets";
import { adminIds, notify, notifyEach } from "@/lib/notifications";
import { publishedDayText } from "@/lib/schedule/cells";
import type { PublishedShift } from "@/lib/schedule/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { communicationJobs } from "./communication-jobs";
import { existingRunDecision } from "./runs";

type Db = ReturnType<typeof createAdminClient>;

/** Giorni di conservazione dei tentativi di accesso (login_attempts). */
export const LOGIN_ATTEMPTS_RETENTION_DAYS = 30;

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
  /** false = si esegue a ogni chiamata senza passare da cron_runs (idempotenza propria). */
  idempotent?: boolean;
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
      const [missing] = await getMissingCompilers(db, [today]);
      const targets = missing?.profileIds ?? [];
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

type Claim = { claimed: true } | { claimed: false; outcome: string; failed: boolean };

/**
 * Prenota l'esecuzione di un job per la sua chiave (riga «running» in cron_runs). Due chiamate
 * concorrenti non lo eseguono due volte: vince chi inserisce la riga o chi la riprende con
 * l'aggiornamento condizionato sullo stato letto.
 */
async function claimRun(db: Db, job: string, runKey: string): Promise<Claim> {
  const { error } = await db
    .from("cron_runs")
    .insert({ job, run_key: runKey, status: "running", attempts: 1 });
  if (!error) return { claimed: true };
  // 23505 = chiave già presente; qualsiasi altro errore è un guasto, non «già eseguito».
  if (error.code !== "23505") {
    console.error("cron", job, error);
    return { claimed: false, outcome: `errore: ${error.message}`, failed: true };
  }

  const { data: run, error: readError } = await db
    .from("cron_runs")
    .select("status, attempts, ran_at")
    .eq("run_key", runKey)
    .maybeSingle();
  if (readError || !run) {
    return {
      claimed: false,
      outcome: `errore: ${readError?.message ?? "esecuzione non leggibile"}`,
      failed: true,
    };
  }
  const decision = existingRunDecision(run);
  if (decision === "done") return { claimed: false, outcome: "già eseguito", failed: false };
  if (decision === "busy") return { claimed: false, outcome: "in corso", failed: false };
  if (decision === "exhausted")
    return { claimed: false, outcome: "non riuscito: tentativi esauriti", failed: false };

  const { data: retaken, error: retakeError } = await db
    .from("cron_runs")
    .update({ status: "running", attempts: run.attempts + 1, ran_at: new Date().toISOString() })
    .eq("run_key", runKey)
    .eq("status", run.status)
    .eq("attempts", run.attempts)
    .select("id");
  if (retakeError)
    return { claimed: false, outcome: `errore: ${retakeError.message}`, failed: true };
  // Nessuna riga: un'altra chiamata l'ha ripreso un attimo prima.
  if (!retaken?.length) return { claimed: false, outcome: "in corso", failed: false };
  return { claimed: true };
}

/**
 * Esegue i job dovuti. Ogni job gira al massimo una volta per chiave: il dispatcher va chiamato
 * spesso (ogni 15 minuti) senza duplicare le notifiche. Un job in errore resta «failed» e uno
 * interrotto (timeout della funzione) resta «running»: alla chiamata successiva si riprova.
 * `failed` elenca i job andati in errore in questa chiamata (la route risponde 500).
 */
export async function runDueJobs(opts: { only?: string; force?: boolean } = {}) {
  const ctx = cronContext();
  const results: Record<string, unknown> = {};
  const failed: string[] = [];
  // Le esecuzioni passate servono solo all'idempotenza: si tengono 60 giorni.
  await ctx.db
    .from("cron_runs")
    .delete()
    .lt("ran_at", new Date(Date.now() - 60 * 86_400_000).toISOString());
  // I tentativi di accesso servono solo al blocco (15 minuti): si tengono 30 giorni.
  await ctx.db
    .from("login_attempts")
    .delete()
    .lt("at", new Date(Date.now() - LOGIN_ATTEMPTS_RETENTION_DAYS * 86_400_000).toISOString());
  for (const job of registry) {
    if (opts.only && job.name !== opts.only) continue;
    const due = ctx.time >= job.after && (!job.days?.length || job.days.includes(ctx.weekday));
    if (!due && !opts.force) continue;
    const runKey = job.key ? job.key(ctx) : `${job.name}:${ctx.today}`;
    // Con idempotenza propria, o forzato a mano: si esegue senza toccare cron_runs (un errore
    // di un'esecuzione forzata non cancella né sporca quella pianificata).
    const tracked = job.idempotent !== false && !opts.force;
    if (tracked) {
      const claim = await claimRun(ctx.db, job.name, runKey);
      if (!claim.claimed) {
        results[job.name] = claim.outcome;
        if (claim.failed) failed.push(job.name);
        continue;
      }
    }
    try {
      const result = await job.run(ctx);
      results[job.name] = result;
      if (tracked) {
        await ctx.db
          .from("cron_runs")
          .update({ status: "done", result: result as never })
          .eq("run_key", runKey);
      }
    } catch (error) {
      console.error("cron", job.name, error);
      results[job.name] = { error: String(error) };
      failed.push(job.name);
      // Si riproverà alla prossima chiamata (fino a MAX_RUN_ATTEMPTS).
      if (tracked) {
        await ctx.db
          .from("cron_runs")
          .update({ status: "failed", result: { error: String(error) } as never })
          .eq("run_key", runKey);
      }
    }
  }
  return { at: `${ctx.today} ${ctx.time}`, results, failed };
}
