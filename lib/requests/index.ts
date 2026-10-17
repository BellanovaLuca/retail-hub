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
  /** Colleghi dello stesso reparto in ferie/assenti per giorno (escluso me). */
  colleaguesAwayByDate: Record<string, number>;
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
