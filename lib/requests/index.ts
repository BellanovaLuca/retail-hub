import { differenceInCalendarDays, parseISO } from "date-fns";

export const REQUEST_TYPES = [
  { value: "ferie", label: "Ferie", description: "Uno o più giorni di ferie." },
  { value: "permesso", label: "Permesso", description: "Qualche ora o una giornata." },
  { value: "cambio_turno", label: "Cambio turno", description: "Chiedi di cambiare un tuo turno." },
  {
    value: "scambio_turno",
    label: "Scambio con un collega",
    description: "Scambia un turno con un collega.",
  },
  {
    value: "giorno_libero",
    label: "Giorno libero",
    description: "Un giorno di riposo in una data precisa.",
  },
  {
    value: "indisponibilita",
    label: "Indisponibilità ricorrente",
    description: "Giorni della settimana in cui non puoi lavorare per un periodo.",
  },
  { value: "malattia", label: "Malattia", description: "Solo le date: mai la diagnosi." },
  { value: "altro", label: "Altro", description: "Qualsiasi altra richiesta." },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number]["value"];
export type RequestStatus =
  "pending" | "peer_accepted" | "peer_declined" | "approved" | "rejected" | "cancelled";

export function requestTypeLabel(type: string) {
  return REQUEST_TYPES.find((t) => t.value === type)?.label ?? type;
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "In attesa",
  peer_accepted: "Accettata dal collega",
  peer_declined: "Rifiutata dal collega",
  approved: "Approvata",
  rejected: "Rifiutata",
  cancelled: "Annullata",
};

export function statusTone(status: RequestStatus): "warning" | "success" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected" || status === "peer_declined") return "danger";
  if (status === "cancelled") return "neutral";
  return "warning";
}

/** Una richiesta è "aperta" finché nessuno l'ha decisa o annullata. */
export function isOpen(status: RequestStatus) {
  return status === "pending" || status === "peer_accepted" || status === "peer_declined";
}

/** Da decidere da un admin: in attesa (o scambio già accettato dal collega). */
export function awaitsAdmin(r: { type: string; status: RequestStatus }) {
  if (r.type === "scambio_turno") return r.status === "peer_accepted";
  return r.status === "pending";
}

export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start <= b.end && b.start <= a.end;
}

export type RequestWarningInput = {
  today: string;
  startDate: string;
  endDate: string;
  noticeDays: number;
  type: RequestType;
  myOpenRequests: { id?: string; type: string; startDate: string; endDate: string }[];
  /** Colleghi dello stesso reparto in ferie confermate per giorno (escluso me). */
  colleaguesAwayByDate: Record<string, number>;
  /** Le mie assenze già a planning (anche inserite dall'admin), nel periodo richiesto. */
  myPlannedLeaves?: {
    date: string;
    type: string;
    status: string;
    /** Nata da una richiesta approvata: è già tra le richieste, non si segnala due volte. */
    fromRequest: boolean;
  }[];
};

const LEAVE_WORDS: Record<string, string> = {
  ferie: "in ferie",
  permesso: "in permesso",
  malattia: "in malattia",
  altro: "assente",
};

/** Avvisi NON bloccanti mostrati prima dell'invio (§6.1). */
export function requestWarnings(i: RequestWarningInput): string[] {
  const out: string[] = [];
  const notice = differenceInCalendarDays(parseISO(i.startDate), parseISO(i.today));
  if (i.type !== "malattia" && notice < i.noticeDays) {
    out.push(
      notice < 0
        ? "La data è già passata."
        : `Il preavviso minimo è di ${i.noticeDays} giorni: questa richiesta ne ha ${notice}.`,
    );
  }
  const clash = i.myOpenRequests.filter((r) =>
    overlaps({ start: r.startDate, end: r.endDate }, { start: i.startDate, end: i.endDate }),
  );
  if (clash.length) {
    out.push(
      `Si sovrappone a ${clash.length === 1 ? "un'altra tua richiesta" : `${clash.length} tue richieste`} (${clash
        .map((c) => requestTypeLabel(c.type).toLowerCase())
        .join(", ")}).`,
    );
  }
  const planned = (i.myPlannedLeaves ?? []).filter((l) => !l.fromRequest);
  if (planned.length) {
    const days = [...new Set(planned.map((l) => l.date))].sort();
    const kinds = [...new Set(planned.map((l) => LEAVE_WORDS[l.type] ?? "assente"))];
    const tentative = planned.every((l) => l.status === "tentative");
    out.push(
      `Nel planning risulti già ${kinds.join(" o ")}${tentative ? " (da confermare)" : ""} il ${days
        .slice(0, 5)
        .map((d) => formatRange(d, d))
        .join(", ")}${days.length > 5 ? ` e altri ${days.length - 5} giorni` : ""}.`,
    );
  }
  if (i.type === "ferie" || i.type === "giorno_libero" || i.type === "permesso") {
    const max = Math.max(0, ...Object.values(i.colleaguesAwayByDate));
    if (max > 0) {
      out.push(
        `In quei giorni ${max === 1 ? "è già in ferie 1 collega" : `sono già in ferie fino a ${max} colleghi`} del tuo reparto.`,
      );
    }
  }
  return out;
}

/** "14–16 ott", "14 ott", "30 ott – 2 nov" */
export function formatRange(start: string, end: string) {
  const s = parseISO(start);
  const e = parseISO(end);
  const months = [
    "gen",
    "feb",
    "mar",
    "apr",
    "mag",
    "giu",
    "lug",
    "ago",
    "set",
    "ott",
    "nov",
    "dic",
  ];
  if (start === end) return `${s.getDate()} ${months[s.getMonth()]}`;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${months[s.getMonth()]}`;
  }
  return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]}`;
}

export const WEEKDAY_NAMES = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

/** Cosa ha già una persona in un giorno: un turno o un'assenza (ferie, permesso…). */
export type DayOccupation = {
  profileId: string;
  date: string;
  kind: "turno" | "assenza";
  /** "10:00–14:00" per un turno; "in ferie", "assente"… per un'assenza. */
  text: string;
};

/**
 * Avvisi di uno scambio turno (§6.2): chi riceve un turno ha già un turno o un'assenza
 * quel giorno? Con `targetDate` = giorno del turno del collega preso in cambio (null se il
 * collega prende solo il turno di chi chiede).
 */
export function swapConflicts(i: {
  requester: { id: string; name: string };
  target: { id: string; name: string };
  shiftDate: string;
  targetDate: string | null;
  occupations: DayOccupation[];
  formatDay?: (date: string) => string;
}): string[] {
  const day = i.formatDay ?? ((d) => formatRange(d, d));
  const out: string[] = [];
  const check = (who: { id: string; name: string }, date: string, givesShiftThatDay: boolean) => {
    for (const o of i.occupations) {
      if (o.profileId !== who.id || o.date !== date) continue;
      // Il turno che cede quel giorno non è un conflitto: è proprio quello scambiato.
      if (o.kind === "turno" && givesShiftThatDay) continue;
      out.push(
        o.kind === "turno"
          ? `Attenzione: ${who.name} ha già un turno il ${day(date)} (${o.text}).`
          : `Attenzione: ${who.name} è ${o.text} il ${day(date)}.`,
      );
    }
  };
  // Il collega riceve il turno di chi chiede.
  check(i.target, i.shiftDate, i.targetDate === i.shiftDate);
  // Chi chiede riceve il turno del collega (se c'è).
  if (i.targetDate) check(i.requester, i.targetDate, i.targetDate === i.shiftDate);
  return [...new Set(out)];
}

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
];

/**
 * Controllo dell'allegato di una richiesta: usato sul telefono prima dell'invio (un file troppo
 * grande farebbe fallire la Server Action ancora prima del controllo) e di nuovo sul server.
 */
export function attachmentError(file: { size: number; type: string }): string | null {
  if (file.size === 0) return "Scegli un file.";
  if (file.size > ATTACHMENT_MAX_BYTES) return "L'allegato deve pesare meno di 10 MB.";
  if (!ATTACHMENT_TYPES.includes(file.type)) return "Formati ammessi: PDF, JPG, PNG, HEIC, WebP.";
  return null;
}
