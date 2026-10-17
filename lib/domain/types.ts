/**
 * Tipi condivisi della logica di dominio (turni, coperture, regole, ferie).
 * Solo tipi: nessuna dipendenza da React, dal database o dal server.
 */

/** Area del negozio in cui si lavora. */
export type Zone = "vista" | "sole";
/** Area di base di una persona: i jolly scelgono l'area turno per turno. */
export type HomeZone = Zone | "jolly";
/** Orario del giorno "HH:mm" (00:00–24:00). */
export type Time = string;
/** Data "yyyy-MM-dd". */
export type ISODate = string;
/** Fascia oraria [start, end) nello stesso giorno. */
export type Interval = { start: Time; end: Time };

/** Un turno (o un pezzo di turno spezzato), come una riga della tabella `shifts`. */
export type ShiftInput = {
  id?: string;
  profileId: string;
  date: ISODate;
  start: Time;
  end: Time;
  /** Pausa senza posizione nella giornata: riduce le ore, non la presenza. */
  breakMinutes: number;
  /** Area del turno (per i fissi = home_zone). */
  zone: Zone | null;
  /** Già risolto: shifts.is_back_office ?? !profile.counts_for_coverage. */
  backOffice: boolean;
  /** Reparto in cui lavora quel giorno (null = reparto principale). */
  departmentId: string | null;
};

export type PersonInput = {
  id: string;
  displayName: string;
  weeklyHours: number | null;
  homeZone: HomeZone;
  departmentIds: string[];
  primaryDepartmentId: string | null;
};

export type LeaveType = "ferie" | "permesso" | "malattia" | "altro";
export type LeaveStatus = "tentative" | "confirmed";

export type LeaveInput = {
  profileId: string;
  date: ISODate;
  type: LeaveType;
  /** Ore di una giornata parziale (es. permesso di 4 ore); null = giornata intera. */
  hours: number | null;
  status: LeaveStatus;
};

/** Orario di apertura per giorno ISO della settimana (1 = lunedì … 7 = domenica); null = chiuso. */
export type OpeningHours = Record<number, Interval | null>;

/** Reparto: "Management" | "Ottici" | "Addetti vendita". */
export type DepartmentRef = { id: string; name: string };

/** Nomi dei reparti seminati (§5). */
export const DEPARTMENT_NAMES = {
  management: "Management",
  ottici: "Ottici",
  addettiVendita: "Addetti vendita",
} as const;
