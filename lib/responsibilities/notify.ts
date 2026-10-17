import "server-only";
import { findUncoveredResponsibilities } from "@/lib/data/responsibilities";
import { adminIds, notify } from "@/lib/notifications";

/**
 * Per il cron mattutino: avvisa gli admin delle attività di oggi senza nessuno in turno
 * (né il responsabile né un supporto). Restituisce le attività segnalate.
 */
export async function sendUncoveredResponsibilitiesAlert(date: string) {
  const uncovered = await findUncoveredResponsibilities(date);
  if (uncovered.length > 0) {
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
  return uncovered;
}
