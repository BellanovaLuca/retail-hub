import { z } from "zod";
import { isValidEmployeeCode, normalizeEmployeeCode } from "@/lib/auth/pin";

/** Toni personali sobri (§9): compaiono solo come pallino e bordo sottile. */
export const PERSON_COLORS = [
  "#57534e",
  "#1f3a5f",
  "#a87b3d",
  "#4d6b57",
  "#7a4a5a",
  "#3f5a73",
  "#8a6f4e",
  "#5b5f8a",
  "#6b7a4a",
  "#8a4f3f",
  "#3d6b6b",
  "#77657a",
] as const;

const collapseSpaces = (v: string) => v.replace(/\s+/g, " ");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const employeeSchema = z
  .object({
    firstName: z.string().trim().min(1, "Inserisci il nome.").max(60),
    lastName: z.string().trim().min(1, "Inserisci il cognome.").max(60),
    displayName: z
      .string()
      .trim()
      .min(2, "Almeno 2 caratteri.")
      .max(24, "Al massimo 24 caratteri.")
      // "Fra  R." e "Fra R." sono lo stesso nome a schermo.
      .transform(collapseSpaces),
    shortLabel: optionalText(12).transform((v) => (v ? collapseSpaces(v).toUpperCase() : v)),
    employeeCode: z
      .string()
      .transform(normalizeEmployeeCode)
      .refine(isValidEmployeeCode, "Codice non valido: lettere, numeri e trattini (es. CRD-014)."),
    role: z.enum(["admin", "employee"]),
    weeklyHours: z.coerce
      .number({ message: "Ore non valide." })
      .min(0)
      .max(60, "Al massimo 60 ore.")
      .multipleOf(0.5, "Usa mezze ore (es. 37,5).")
      .nullable(),
    homeZone: z.enum(["vista", "sole", "jolly"]),
    countsForCoverage: z.boolean(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .nullable(),
    departmentIds: z.array(z.uuid()).min(1, "Scegli almeno un reparto."),
    primaryDepartmentId: z.uuid({ message: "Scegli il reparto principale." }),
    email: z
      .union([z.literal(""), z.email("Email non valida.")])
      .transform((v) => v || null)
      .nullable()
      .optional(),
    phone: optionalText(30),
    adminNotes: optionalText(2000),
  })
  .refine((v) => v.departmentIds.includes(v.primaryDepartmentId), {
    path: ["primaryDepartmentId"],
    message: "Il reparto principale deve essere tra quelli selezionati.",
  });

export type EmployeeInput = z.input<typeof employeeSchema>;
export type EmployeeValues = z.output<typeof employeeSchema>;
