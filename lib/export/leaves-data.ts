/**
 * Dati comuni agli export del planning ferie (Excel e PDF): chi è in ferie giorno per giorno,
 * nell'ordine delle persone del foglio. Logica pura.
 */
import { formatLeaveCell } from "@/lib/leaves/parse";
import type { LeaveStatus, LeaveType } from "@/lib/domain/types";

export type ExportPerson = { id: string; displayName: string; departmentName: string | null };

export type ExportLeave = {
  profileId: string;
  date: string;
  /** "assente" = planning pubblico (motivo nascosto). */
  type: LeaveType | "assente";
  hours: number | null;
  status: LeaveStatus;
};

export type LeavesExportData = {
  year: number;
  title: string;
  /** Sottotitolo (es. reparto filtrato, "Planning pubblico"). */
  subtitle: string;
  /** "admin": codici completi; "public": solo Ferie / Assente. */
  audience: "admin" | "public";
  people: ExportPerson[];
  leaves: ExportLeave[];
  holidays: Map<string, string>;
};

/** Codice della cella nel foglio "Persone × giorni". */
export function exportCellCode(l: ExportLeave, audience: "admin" | "public") {
  if (audience === "admin" && l.type !== "assente") {
    return formatLeaveCell({ type: l.type, status: l.status, hours: l.hours });
  }
  const base = l.type === "ferie" ? "F" : "A";
  return `${base}${l.status === "tentative" ? "?" : ""}`;
}

/** Nome nel calendario: "Luca", "Luca?" (da confermare), "Marta (PE4)", "Paolo (assente)". */
export function exportChip(l: ExportLeave, name: string, audience: "admin" | "public") {
  const q = l.status === "tentative" ? "?" : "";
  if (l.type === "ferie") return `${name}${q}`;
  if (audience === "public" || l.type === "assente") return `${name}${q} (assente)`;
  return `${name}${q} (${formatLeaveCell({ type: l.type, status: "confirmed", hours: l.hours })})`;
}

/** Per ogni giorno, i nomi di chi è in ferie o assente, nell'ordine del foglio. */
export function namesByDate(data: LeavesExportData): Map<string, string[]> {
  const order = new Map(data.people.map((p, i) => [p.id, i]));
  const name = new Map(data.people.map((p) => [p.id, p.displayName]));
  const grouped = new Map<string, ExportLeave[]>();
  for (const l of data.leaves) {
    if (!order.has(l.profileId)) continue;
    grouped.set(l.date, [...(grouped.get(l.date) ?? []), l]);
  }
  const out = new Map<string, string[]>();
  for (const [date, list] of grouped) {
    list.sort((a, b) => order.get(a.profileId)! - order.get(b.profileId)!);
    out.set(
      date,
      list.map((l) => exportChip(l, name.get(l.profileId)!, data.audience)),
    );
  }
  return out;
}

/** Elenco di nomi accorciato a `maxChars` caratteri, con "+N" per quelli che non ci stanno. */
export function fitNames(names: string[], maxChars: number): string {
  const full = names.join(", ");
  if (full.length <= maxChars) return full;
  const kept: string[] = [];
  let length = 0;
  for (let i = 0; i < names.length; i++) {
    const after = names.length - i - 1;
    const add = (kept.length ? 2 : 0) + names[i].length;
    // Se si tiene questo nome, deve restare spazio per "+N" degli altri.
    if (length + add + (after ? ` +${after}`.length : 0) > maxChars) {
      return `${kept.join(", ")} +${after + 1}`.trim();
    }
    kept.push(names[i]);
    length += add;
  }
  return kept.join(", ");
}
