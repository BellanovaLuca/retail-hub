import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

export const DAY_LETTERS = ["L", "M", "M", "G", "V", "S", "D"] as const;

/** "lun 12" per le intestazioni del tabellone. */
export const dayHeader = (iso: string) => format(parseISO(iso), "EEE d", { locale: it });

/** "mer 14 ottobre" per le etichette accessibili. */
export const dayLong = (iso: string) => format(parseISO(iso), "EEEE d MMMM", { locale: it });

/** "14/10" */
export const dayShort = (iso: string) => format(parseISO(iso), "dd/MM");

/** "gio 15 ott alle 09:42" nel fuso del negozio. */
export function doneAtLabel(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} alle ${time}`;
}

export { DAY_NAMES, scheduleLabel } from "@/lib/responsibilities/labels";
