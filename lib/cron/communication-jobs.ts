import "server-only";
import { sendDueAnnouncementNotifications } from "@/lib/announcements/notify";
import { getChecks, getOnShift, getResponsibilities } from "@/lib/data/responsibilities";
import { adminIds, notify, notifyEach } from "@/lib/notifications";
import {
  dutiesForPerson,
  hasAssignees,
  isScheduledOn,
  mondayOf,
  uncheckedOn,
  uncoveredByReason,
} from "@/lib/responsibilities/assignment";
import type { CronJob } from "./jobs";

/** Job delle responsabilità (§8.4, §10) e delle comunicazioni programmate (§6.2). */
export const communicationJobs: CronJob[] = [
  {
    name: "responsabilita-mattina",
    description:
      "All'inizio della giornata: a ciascuno le responsabilità di oggi; agli admin quelle senza nessuno.",
    after: "09:00",
    async run({ db, today }) {
      const [onShift, responsibilities] = await Promise.all([
        getOnShift(db, today),
        getResponsibilities(db, { week: mondayOf(today) }),
      ]);
      if (onShift === null) return { skipped: "turni del giorno non pubblicati" };
      const names = new Map(
        responsibilities
          .flatMap((r) => [r.owner, ...r.supports])
          .filter(Boolean)
          .map((p) => [p!.id, p!.name]),
      );
      const items = [...onShift]
        .map((profileId) => ({
          profileId,
          duties: dutiesForPerson(responsibilities, profileId, today, onShift),
        }))
        .filter((x) => x.duties.some((d) => d.role !== "all_staff"));
      await notifyEach(
        items.map(({ profileId, duties }) => ({
          profileId,
          notification: {
            kind: "responsibility_today" as const,
            title: "Oggi tocca a te",
            body: duties
              .filter((d) => d.role !== "all_staff")
              .map((d) =>
                d.role === "substitute" && d.replacingId
                  ? `${d.responsibility.title} (sostituisci ${names.get(d.replacingId) ?? "il responsabile"})`
                  : d.responsibility.title,
              )
              .join(", "),
            link: "/comunicazioni/responsabilita/spunte",
          },
        })),
      );
      // Due avvisi distinti: chi è assegnato oggi non è in turno / non è assegnato nessuno.
      const { away, unassigned } = uncoveredByReason(responsibilities, today, onShift);
      const admins = away.length || unassigned.length ? await adminIds() : [];
      if (away.length) {
        await notify(admins, {
          kind: "responsibility_uncovered",
          title:
            away.length === 1
              ? `Oggi nessuno in turno per «${away[0].title}»`
              : `Oggi ${away.length} responsabilità senza nessuno in turno`,
          body: `Chi è assegnato oggi non è in turno: ${away.map((u) => u.title).join(", ")}`,
          link: "/admin/comunicazioni/responsabilita",
        });
      }
      if (unassigned.length) {
        await notify(admins, {
          kind: "responsibility_uncovered",
          title:
            unassigned.length === 1
              ? `«${unassigned[0].title}» non è assegnata a nessuno`
              : `${unassigned.length} responsabilità senza nessuno assegnato`,
          body: `Da assegnare nella griglia «Chi fa cosa»: ${unassigned.map((u) => u.title).join(", ")}`,
          link: "/admin/comunicazioni/responsabilita",
        });
      }
      return { notified: items.length, uncovered: away.length, unassigned: unassigned.length };
    },
  },
  {
    name: "responsabilita-sera",
    description: "A fine giornata: riepilogo agli admin delle attività previste e non spuntate.",
    after: "19:30",
    async run({ db, today }) {
      const [responsibilities, checks] = await Promise.all([
        getResponsibilities(db, { week: mondayOf(today) }),
        getChecks(db, today, today, new Map()),
      ]);
      // Stessa regola del controllo delle spunte: «non spuntata» è un'attività prevista oggi con
      // qualcuno assegnato; quelle senza nessuno assegnato si elencano a parte.
      const missing = uncheckedOn(responsibilities, today, (r) => !!checks[r.id]?.[today]);
      const unassigned = responsibilities.filter(
        (r) =>
          !hasAssignees(r) && isScheduledOn(r.scheduleDays, today) && !checks[r.id]?.[today],
      );
      if (missing.length) {
        await notify(await adminIds(), {
          kind: "responsibility_missed",
          title:
            missing.length === 1
              ? "1 responsabilità non spuntata oggi"
              : `${missing.length} responsabilità non spuntate oggi`,
          body: `${missing.map((r) => r.title).join(", ")}${
            unassigned.length
              ? `\nSenza nessuno assegnato: ${unassigned.map((r) => r.title).join(", ")}`
              : ""
          }`,
          link: "/admin/comunicazioni/responsabilita",
        });
      }
      return { missing: missing.length, unassigned: unassigned.length };
    },
  },
  {
    name: "comunicazioni-programmate",
    description:
      "Notifica le comunicazioni programmate quando arriva il momento della pubblicazione.",
    after: "00:00",
    // A ogni chiamata: l'idempotenza la garantisce announcements.notified_at.
    idempotent: false,
    run: async () => sendDueAnnouncementNotifications(),
  },
];
