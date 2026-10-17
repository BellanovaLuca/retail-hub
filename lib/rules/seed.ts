/**
 * Seed del set di regole "Standard" e delle variabili iniziali (§7.3), come DATI.
 * I reparti si indicano per nome (`{ kind: "department", departmentName: "Ottici" }`) e si
 * risolvono in id con `resolveSeedRules` al momento del seed.
 */
import type { DepartmentRef } from "@/lib/domain/types";
import { findDepartmentId } from "@/lib/coverage";
import type { RuleRecord } from "./types";

export type SeedVariable = {
  key: string;
  label: string;
  value: number;
  unit: string;
  description: string;
};

export type SeedRule = Omit<RuleRecord, "id"> & { sortOrder: number };

export type RuleSetSeed = {
  name: string;
  description: string;
  variables: SeedVariable[];
  rules: SeedRule[];
};

/** Fascia 13–14 esclusa: le regole di presenza usano due fasce attorno alla pausa pranzo. */
const MORNING = { start: "07:00", end: "13:00" };
const AFTERNOON = { start: "14:00", end: "22:00" };

const common = {
  validFrom: null,
  validTo: null,
  severity: "warning" as const,
  active: true,
};

export const STANDARD_RULE_SET: RuleSetSeed = {
  name: "Standard",
  description: "Coperture e riposi ricavati dai fogli Week 39/40, da tarare.",
  variables: [
    {
      key: "min_ottici",
      label: "Ottici minimi in vendita",
      value: 1,
      unit: "persone",
      description: "COP. OTT.: ottici in vendita per tutto l'orario di apertura (esclusa 13–14).",
    },
    {
      key: "min_vista",
      label: "Minimo Vista",
      value: 2,
      unit: "persone",
      description: "Persone in Vista dalle 11:00 alle 19:00 (esclusa 13–14).",
    },
    {
      key: "min_vista_bordi",
      label: "Minimo Vista in apertura e chiusura",
      value: 1,
      unit: "persone",
      description: "Persone in Vista tra l'apertura e le 11:00 e dalle 19:00 alla chiusura.",
    },
    {
      key: "min_sole_apertura",
      label: "Minimo Sole in apertura",
      value: 1,
      unit: "persone",
      description: "Il piano Sole può essere aperto da una persona sola (10:00–12:00).",
    },
    {
      key: "min_sole_sera",
      label: "Minimo Sole dalle 12 a chiusura",
      value: 2,
      unit: "persone",
      description: "La sera si preferisce più copertura in Sole (esclusa 13–14).",
    },
    {
      key: "min_backoffice_apertura",
      label: "Minimo in apertura back office",
      value: 1,
      unit: "persone",
      description: "Persone presenti dalle 08:30 (90 minuti prima dell'apertura), lunedì–sabato.",
    },
    {
      key: "tolleranza_ore",
      label: "Tolleranza ore di contratto",
      value: 10,
      unit: "%",
      description: "Scostamento ammesso tra ore pianificate e ore di contratto.",
    },
  ],
  rules: [
    {
      ...common,
      sortOrder: 1,
      name: "COP. OTT.",
      type: "min_presence",
      params: {
        scope: { kind: "department", departmentName: "Ottici" },
        min: { var: "min_ottici" },
        includeBackOffice: false,
      },
      days: [],
      timeWindows: [MORNING, AFTERNOON],
    },
    {
      ...common,
      sortOrder: 2,
      name: "Vista 11–19",
      type: "min_presence",
      params: {
        scope: { kind: "zone", zone: "vista" },
        min: { var: "min_vista" },
        includeBackOffice: false,
      },
      days: [],
      timeWindows: [
        { start: "11:00", end: "13:00" },
        { start: "14:00", end: "19:00" },
      ],
    },
    {
      ...common,
      sortOrder: 3,
      name: "Vista apertura",
      type: "min_presence",
      params: {
        scope: { kind: "zone", zone: "vista" },
        min: { var: "min_vista_bordi" },
        includeBackOffice: false,
      },
      days: [],
      timeWindows: [{ start: "10:00", end: "11:00" }],
    },
    {
      ...common,
      sortOrder: 4,
      name: "Vista chiusura",
      type: "min_presence",
      params: {
        scope: { kind: "zone", zone: "vista" },
        min: { var: "min_vista_bordi" },
        includeBackOffice: false,
      },
      days: [],
      timeWindows: [{ start: "19:00", end: "20:00" }],
    },
    {
      ...common,
      sortOrder: 5,
      name: "Sole apertura",
      type: "min_presence",
      params: {
        scope: { kind: "zone", zone: "sole" },
        min: { var: "min_sole_apertura" },
        includeBackOffice: false,
      },
      days: [],
      timeWindows: [{ start: "10:00", end: "12:00" }],
    },
    {
      ...common,
      sortOrder: 6,
      name: "Sole sera",
      type: "min_presence",
      params: {
        scope: { kind: "zone", zone: "sole" },
        min: { var: "min_sole_sera" },
        includeBackOffice: false,
      },
      days: [],
      timeWindows: [{ start: "12:00", end: "13:00" }, AFTERNOON],
    },
    {
      ...common,
      sortOrder: 7,
      name: "Apertura back office",
      type: "opening_presence",
      params: {
        minutesBeforeOpening: 90,
        min: { var: "min_backoffice_apertura" },
        scope: { kind: "all" },
        includeBackOffice: true,
      },
      days: [1, 2, 3, 4, 5, 6],
      timeWindows: [],
    },
    {
      ...common,
      sortOrder: 8,
      name: "Ore di contratto",
      type: "weekly_hours_deviation",
      params: { pct: { var: "tolleranza_ore" } },
      days: [],
      timeWindows: [],
    },
    {
      ...common,
      sortOrder: 9,
      name: "Riposo tra turni",
      type: "min_rest_between_shifts",
      params: { hours: 11 },
      days: [],
      timeWindows: [],
    },
    {
      ...common,
      sortOrder: 10,
      name: "Giorni consecutivi",
      type: "max_consecutive_days",
      params: { days: 6 },
      days: [],
      timeWindows: [],
    },
    {
      ...common,
      sortOrder: 11,
      name: "Riposo settimanale",
      type: "min_weekly_rest_days",
      params: { days: 1 },
      days: [],
      timeWindows: [],
    },
    {
      ...common,
      sortOrder: 12,
      name: "Pausa obbligatoria",
      type: "mandatory_break",
      params: { afterHours: 6, minMinutes: 30 },
      days: [],
      timeWindows: [],
    },
  ],
};

/** Sostituisce, ovunque nei parametri, `{kind:"department", departmentName}` con il `departmentId`. */
function resolveDepartmentNames(value: unknown, departments: DepartmentRef[]): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveDepartmentNames(v, departments));
  if (value === null || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  if (obj.kind === "department" && typeof obj.departmentName === "string") {
    const id = findDepartmentId(departments, obj.departmentName);
    if (!id)
      throw new Error(`Reparto "${obj.departmentName}" non trovato per il seed delle regole`);
    const rest = { ...obj };
    delete rest.departmentName;
    return { ...rest, departmentId: id };
  }
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, resolveDepartmentNames(v, departments)]),
  );
}

/** Regole del seed con i reparti risolti in id. Lancia un errore se un reparto non esiste. */
export function resolveSeedRules(seed: RuleSetSeed, departments: DepartmentRef[]): SeedRule[] {
  return seed.rules.map((r) => ({ ...r, params: resolveDepartmentNames(r.params, departments) }));
}
