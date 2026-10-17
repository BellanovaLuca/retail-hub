import { z } from "zod";

export const WEEKDAY_LABELS = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
] as const;

export type DayHours = { open: string; close: string } | null;
/** Chiavi "1".."7" (1 = lunedì), come in store_settings.opening_hours. */
export type OpeningHoursMap = Record<string, DayHours>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido (HH:MM).");

export const dayHoursSchema = z
  .object({ open: time, close: time })
  .refine((v) => v.close > v.open, {
    message: "La chiusura deve seguire l'apertura.",
    path: ["close"],
  })
  .nullable();

export const openingHoursSchema = z.object(
  Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), dayHoursSchema])) as Record<
    string,
    typeof dayHoursSchema
  >,
);

/** Legge l'orario salvato tollerando valori mancanti o malformati. */
export function parseOpeningHours(raw: unknown): OpeningHoursMap {
  const out: OpeningHoursMap = {};
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (let d = 1; d <= 7; d++) {
    const parsed = dayHoursSchema.safeParse(source[String(d)] ?? null);
    out[String(d)] = parsed.success ? parsed.data : null;
  }
  return out;
}

export const shiftTemplateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,5}\??$/, "Codice: 1–5 lettere o cifre (es. A, B2, MAN)."),
    label: z.string().trim().min(1, "Inserisci una descrizione.").max(40),
    isAbsence: z.boolean(),
    startTime: time.nullable(),
    endTime: time.nullable(),
    breakMinutes: z.coerce.number().int().min(0).max(240),
    sortOrder: z.coerce.number().int().min(0).max(999),
  })
  .superRefine((v, ctx) => {
    if (v.isAbsence) return;
    if (!v.startTime || !v.endTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Indica inizio e fine." });
    } else if (v.endTime <= v.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "La fine deve seguire l'inizio.",
      });
    }
  });

export type ShiftTemplateValues = z.output<typeof shiftTemplateSchema>;
