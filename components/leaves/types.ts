import type { LeaveStatus, LeaveType } from "@/lib/domain/types";
import { formatLeaveCell, leaveLabel, leaveLabelPublic, leavePublicText } from "@/lib/leaves/parse";

/** "admin": planning completo e modificabile; "employee": sola lettura dai dati pubblici. */
export type PlannerMode = "admin" | "employee";

export type PlannerPerson = {
  id: string;
  displayName: string;
  color: string | null;
  primaryDepartmentId: string | null;
  departmentIds: string[];
};

export type PlannerLeave = {
  profileId: string;
  date: string;
  /** "assente" solo nella vista pubblica (il motivo non si vede, §3). */
  type: LeaveType | "assente";
  hours: number | null;
  status: LeaveStatus;
  /** null nella vista pubblica. */
  source: "planning" | "request" | null;
};

export type PlannerHoliday = { date: string; label: string; storeClosed: boolean };

export type PlannerDepartment = { id: string; name: string };

export type PlannerView = "persone" | "calendario";
export type PlannerPeriod = "mese" | "anno";

/**
 * Testo della cella: il codice (F, F?, PE4) per l'admin; per tutti gli altri "Ferie"/"Assente",
 * con le ore se l'assenza è di poche ore ("Assente 2 h").
 */
export function cellText(leave: PlannerLeave, mode: PlannerMode): string {
  if (mode === "admin" && leave.type !== "assente")
    return formatLeaveCell({ ...leave, type: leave.type });
  return leavePublicText(leave.type === "ferie" ? "ferie" : "assente", leave.hours);
}

/** Descrizione estesa (tooltip, dialog). */
export function leaveDescription(leave: PlannerLeave, mode: PlannerMode): string {
  const base =
    leave.type === "assente"
      ? "Assente"
      : mode === "admin"
        ? leaveLabel(leave.type)
        : leaveLabelPublic(leave.type);
  // Le ore si vedono anche nel planning pubblico (mai il motivo).
  const hours = leave.hours ? ` ${String(leave.hours).replace(".", ",")} h` : "";
  const status = leave.status === "tentative" ? " · da confermare" : "";
  const source = leave.source === "request" ? " · da richiesta approvata" : "";
  return `${base}${hours}${status}${source}`;
}

/**
 * Codice breve accanto al nome nel calendario: per l'admin il codice (PE4, MA…) se non sono
 * ferie; per gli altri "assente", con le ore se l'assenza è di poche ore ("assente 2 h").
 */
export function chipSuffix(leave: PlannerLeave, mode: PlannerMode): string | null {
  const hours = leave.hours ? `${String(leave.hours).replace(".", ",")} h` : null;
  if (leave.type === "ferie") return mode === "admin" ? null : hours;
  if (mode !== "admin" || leave.type === "assente") return hours ? `assente ${hours}` : "assente";
  return formatLeaveCell({ ...leave, type: leave.type, status: "confirmed" });
}
