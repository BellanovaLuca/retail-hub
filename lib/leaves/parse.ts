/**
 * Codici delle celle del foglio ferie (§8.2), senza distinzione maiuscole/minuscole:
 * `F` ferie, `F?` ferie da confermare, `PE` permesso, `PE4` / `PE 4` / `PE4,5` permesso di N ore,
 * `MA` malattia, `A` / `AL` altro. Il `?` finale (da confermare) è ammesso su ogni codice.
 * Le ore sono ammesse solo sul permesso, tra 0,5 e 12 a passi di mezz'ora.
 * `X` (o `x`) svuota la cella, come negli Excel del negozio.
 */
import type { LeaveInput, LeaveStatus, LeaveType } from "@/lib/domain/types";

export type ParsedLeaveCell =
  | { kind: "empty" }
  | { kind: "leave"; type: LeaveType; status: LeaveStatus; hours: number | null }
  | { kind: "error"; message: string };

/** Massimo di ore di un permesso (stesso limite nelle richieste e nel planning). */
export const LEAVE_HOURS_MAX = 12;

const CODES: Record<string, LeaveType> = {
  F: "ferie",
  PE: "permesso",
  MA: "malattia",
  A: "altro",
  AL: "altro",
};

/** Interpreta il testo di una cella del foglio ferie. */
export function parseLeaveCell(text: string): ParsedLeaveCell {
  const raw = text.trim().toUpperCase().replace(/\s+/g, " ");
  if (raw === "" || raw === "X") return { kind: "empty" };

  const m = /^([A-Z]+)\s?(\d+(?:[.,]\d+)?)?\s?(\?)?$/.exec(raw);
  const type = m ? CODES[m[1]] : undefined;
  if (!m || !type) {
    return {
      kind: "error",
      message: `"${text.trim()}" non è un codice valido: usa F, F?, PE, PE4, MA o A`,
    };
  }
  const status: LeaveStatus = m[3] ? "tentative" : "confirmed";
  if (!m[2]) return { kind: "leave", type, status, hours: null };

  if (type !== "permesso") {
    return { kind: "error", message: "Le ore si indicano solo sul permesso (es. PE4)" };
  }
  const hours = Number(m[2].replace(",", "."));
  if (!(hours > 0 && hours <= LEAVE_HOURS_MAX) || (hours * 2) % 1 !== 0) {
    return {
      kind: "error",
      message: `Ore del permesso non valide: da 0,5 a ${LEAVE_HOURS_MAX}, a mezz'ore`,
    };
  }
  return { kind: "leave", type, status, hours };
}

/** Inverso di `parseLeaveCell`: `F`, `F?`, `PE`, `PE4,5`, `MA`, `A`. */
export function formatLeaveCell(leave: Pick<LeaveInput, "type" | "status" | "hours">): string {
  const code = { ferie: "F", permesso: "PE", malattia: "MA", altro: "A" }[leave.type];
  const hours =
    leave.type === "permesso" && leave.hours != null ? String(leave.hours).replace(".", ",") : "";
  return `${code}${hours}${leave.status === "tentative" ? "?" : ""}`;
}

/** Etichetta visibile ai colleghi (privacy §3): "Ferie" se ferie, altrimenti "Assente". */
export function leaveLabelPublic(type: LeaveType): "Ferie" | "Assente" {
  return type === "ferie" ? "Ferie" : "Assente";
}

/** Etichetta completa per l'interessato e gli admin. */
export function leaveLabel(type: LeaveType): string {
  return { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia", altro: "Altra assenza" }[
    type
  ];
}
