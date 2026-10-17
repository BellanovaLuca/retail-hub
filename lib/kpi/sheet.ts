/**
 * Il foglio settimanale di una persona come nel file "OBIETTIVI INDIVIDUALI" (§8.3):
 * righe = voci, colonne = lun→dom + A quanto sei · Quanto mi manca? · Obiettivo (+ Commento week).
 * Logica pura: numeri, finestra dei giorni modificabili, giornate compilate.
 */
import { addDays, format, parseISO } from "date-fns";
import { weekProgress } from "@/lib/targets";

export type SheetKpi = { kpiId: string; code: string; label: string };

export type EntryValue = { profileId?: string; kpiId: string; date: string; value: number };

export type SheetRow = SheetKpi & {
  /** Valore per giorno (null = nessun numero inserito). */
  values: Record<string, number | null>;
  /** "A quanto sei": somma lun→dom. */
  done: number;
  /** Obiettivo della settimana (null = non assegnato). */
  target: number | null;
  /** "Quanto mi manca?": obiettivo − somma, mai sotto zero (null senza obiettivo). */
  remaining: number | null;
  reached: boolean;
  /** Avanzamento 0…1 per la barra (plafonato). */
  ratio: number;
  comment: string;
};

/** Giorni da lunedì a domenica a partire dal lunedì `weekStart` (yyyy-MM-dd). */
export function weekDates(weekStart: string): string[] {
  const monday = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), "yyyy-MM-dd"));
}

export function shiftDate(date: string, days: number): string {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

export function buildPersonSheet(input: {
  days: string[];
  kpis: SheetKpi[];
  entries: EntryValue[];
  targets: Record<string, number>;
  comments?: Record<string, string>;
}): SheetRow[] {
  const byKey = new Map<string, number>();
  for (const e of input.entries) {
    byKey.set(`${e.kpiId}|${e.date}`, (byKey.get(`${e.kpiId}|${e.date}`) ?? 0) + e.value);
  }
  return input.kpis.map((k) => {
    const values: Record<string, number | null> = {};
    for (const d of input.days) values[d] = byKey.get(`${k.kpiId}|${d}`) ?? null;
    const target = k.kpiId in input.targets ? input.targets[k.kpiId] : null;
    const nums = Object.values(values).filter((v): v is number => v !== null);
    const progress = weekProgress(nums, target ?? 0);
    return {
      ...k,
      values,
      done: progress.done,
      target,
      remaining: target === null ? null : progress.remaining,
      reached: target !== null && progress.reached,
      ratio: progressRatio(progress.done, target),
      comment: input.comments?.[k.kpiId] ?? "",
    };
  });
}

/** Avanzamento per la barra: 0 senza obiettivo, 1 se raggiunto o con obiettivo ≤ 0. */
export function progressRatio(done: number, target: number | null): number {
  if (target === null) return 0;
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, done / target));
}

/**
 * Giorni che il dipendente può modificare: da 7 giorni fa a oggi, mai il futuro
 * (stessa finestra della policy RLS su daily_entries).
 */
export function isEditableDate(date: string, today: string, windowDays = 7): boolean {
  return date <= today && date >= shiftDate(today, -windowDays);
}

/** Giornata compilata = almeno un numero salvato (anche 0) per quel giorno. */
export function filledDates(entries: Pick<EntryValue, "date">[]): Set<string> {
  return new Set(entries.map((e) => e.date));
}

/**
 * Interpreta un numero digitato ("3", "2,5", " 4 "). Vuoto → null (svuota la cella).
 * Negativi, testo o valori enormi → "invalid".
 */
export function parseCount(text: string): number | null | "invalid" {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "invalid";
  const n = Number(t);
  if (!Number.isFinite(n) || n > 99_999) return "invalid";
  return n;
}

/** Numero all'italiana, senza decimali inutili. */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

/** Testo di "Quanto mi manca?": "Obiettivo raggiunto ✓" a zero o sotto. */
export function remainingText(row: Pick<SheetRow, "target" | "remaining" | "reached">): string {
  if (row.target === null) return "—";
  if (row.reached) return "Obiettivo raggiunto ✓";
  return formatCount(row.remaining);
}
