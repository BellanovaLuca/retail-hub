import type { LeaveStatus, LeaveType } from "@/lib/domain/types";
import { formatLeaveCell, leaveLabel, leaveLabelPublic } from "@/lib/leaves/parse";

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

/** Testo della cella: il codice (F, F?, PE4) per l'admin, "Ferie"/"Assente" per tutti gli altri. */
export function cellText(leave: PlannerLeave, mode: PlannerMode): string {
  if (mode === "admin" && leave.type !== "assente")
    return formatLeaveCell({ ...leave, type: leave.type });
  return leave.type === "ferie" ? "Ferie" : "Assente";
}

/** Descrizione estesa (tooltip, dialog). */
export function leaveDescription(leave: PlannerLeave, mode: PlannerMode): string {
  const base =
    leave.type === "assente"
      ? "Assente"
      : mode === "admin"
        ? leaveLabel(leave.type)
        : leaveLabelPublic(leave.type);
  const hours =
    mode === "admin" && leave.hours ? ` ${String(leave.hours).replace(".", ",")} h` : "";
  const status = leave.status === "tentative" ? " · da confermare" : "";
  const source = leave.source === "request" ? " · da richiesta approvata" : "";
  return `${base}${hours}${status}${source}`;
}

/** Codice breve accanto al nome nel calendario (solo per l'admin e solo se non sono ferie). */
export function chipSuffix(leave: PlannerLeave, mode: PlannerMode): string | null {
  if (leave.type === "ferie") return null;
  if (mode !== "admin" || leave.type === "assente") return "assente";
  return formatLeaveCell({ ...leave, type: leave.type, status: "confirmed" });
}
