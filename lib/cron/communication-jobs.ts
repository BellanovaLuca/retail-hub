import "server-only";
import { sendDueAnnouncementNotifications } from "@/lib/announcements/notify";
import { getChecks, getOnShift, getResponsibilities } from "@/lib/data/responsibilities";
import { adminIds, notify, notifyEach } from "@/lib/notifications";
import { dutiesForPerson, resolveDuty } from "@/lib/responsibilities/assignment";
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
        getResponsibilities(db),
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
            link: "/comunicazioni/responsabilita",
          },
        })),
      );
      const uncovered = responsibilities.filter(
        (r) => resolveDuty(r, today, onShift).kind === "uncovered",
      );
      if (uncovered.length) {
        await notify(await adminIds(), {
          kind: "responsibility_uncovered",
          title:
            uncovered.length === 1
              ? `Oggi nessuno in turno per «${uncovered[0].title}»`
              : `Oggi ${uncovered.length} responsabilità senza nessuno in turno`,
          body: uncovered.map((u) => u.title).join(", "),
          link: "/admin/comunicazioni/responsabilita",
        });
      }
      return { notified: items.length, uncovered: uncovered.length };
    },
  },
  {
    name: "responsabilita-sera",
    description: "A fine giornata: riepilogo agli admin delle attività previste e non spuntate.",
    after: "19:30",
    async run({ db, today }) {
      const [onShift, responsibilities, checks] = await Promise.all([
        getOnShift(db, today),
        getResponsibilities(db),
        getChecks(db, today, today, new Map()),
      ]);
      const missing = responsibilities.filter((r) => {
        const kind = resolveDuty(r, today, onShift).kind;
        return kind !== "not_scheduled" && !checks[r.id]?.[today];
      });
      if (missing.length) {
        await notify(await adminIds(), {
          kind: "responsibility_missed",
          title: `${missing.length} responsabilità non spuntate oggi`,
          body: missing.map((r) => r.title).join(", "),
          link: "/admin/comunicazioni/responsabilita",
        });
      }
      return { missing: missing.length };
    },
  },
  {
    name: "comunicazioni-programmate",
    description:
      "Notifica le comunicazioni programmate quando arriva il momento della pubblicazione.",
    after: "00:00",
    // A ogni chiamata: l'idempotenza la garantisce announcements.notified_at.
    key: ({ today, time }) => `comunicazioni-programmate:${today}T${time}`,
    run: async () => sendDueAnnouncementNotifications(),
  },
];
