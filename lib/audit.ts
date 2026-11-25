/** Etichette e riassunti leggibili delle righe di audit_log (§6.2 Registro). */

export const ENTITY_LABELS: Record<string, string> = {
  profiles: "Dipendente",
  profile_departments: "Reparti di un dipendente",
  profile_admin_notes: "Note riservate su un dipendente",
  departments: "Reparto",
  store_settings: "Impostazioni negozio",
  shift_templates: "Turno rapido",
  holidays: "Festività",
  opening_exceptions: "Eccezione d'orario",
  schedule_weeks: "Settimana turni",
  shifts: "Turno",
  schedule_templates: "Modello di settimana",
  rule_overrides: "Avviso ignorato",
  planning_rule_sets: "Set di regole",
  planning_rules: "Regola di pianificazione",
  planning_variables: "Variabile di pianificazione",
  requests: "Richiesta",
  leaves: "Ferie / assenza",
  announcements: "Comunicazione",
  responsibilities: "Responsabilità",
  responsibility_assignees: "Assegnazione responsabilità",
  responsibility_checks: "Spunta responsabilità",
  extra_tasks: "Attività extra",
  extra_task_assignees: "Assegnatario attività extra",
  kpi_definitions: "Voce obiettivi",
  kpi_sets: "Gruppo di voci",
  kpi_set_items: "Voce di un gruppo",
  profile_kpis: "Voci di una persona",
  store_weekly_targets: "Obiettivi negozio",
  weekly_targets: "Obiettivo settimanale",
  daily_entries: "Numeri giornalieri",
  weekly_comments: "Commento settimanale",
  performance_periods: "Periodo di performance",
  performance_goals: "Obiettivo di performance",
};

export const ACTION_LABELS: Record<string, string> = {
  insert: "Creato",
  update: "Modificato",
  delete: "Eliminato",
};

/** Campi tecnici che non servono nel riepilogo. */
const HIDDEN = new Set([
  "id",
  "created_at",
  "updated_at",
  "published_shifts",
  "ical_token",
  "notification_prefs",
]);
/** Campi che non vanno mai mostrati (dati riservati non necessari al registro). */
const REDACTED = new Set(["admin_notes", "private_note"]);
/** Colonne riservate solo in certe tabelle (altrove lo stesso nome è un campo qualsiasi). */
const REDACTED_BY_ENTITY: Record<string, ReadonlySet<string>> = {
  profile_admin_notes: new Set(["notes"]),
};

function isRedacted(key: string, entity?: string) {
  return REDACTED.has(key) || Boolean(entity && REDACTED_BY_ENTITY[entity]?.has(key));
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "sì" : "no";
  if (Array.isArray(value)) return value.length ? value.map(show).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

/**
 * Elenco "campo: prima → dopo" (modifica) o dei valori principali (creazione/eliminazione).
 * Con `entity` (la tabella della riga) si oscurano anche le colonne riservate di quella tabella.
 */
export function summarizeDiff(action: string, diff: unknown, max = 6, entity?: string): string[] {
  if (!diff || typeof diff !== "object") return [];
  const entries = Object.entries(diff as Record<string, unknown>).filter(([k]) => !HIDDEN.has(k));
  const lines =
    action === "update"
      ? entries.map(([k, v]) => {
          if (isRedacted(k, entity)) return `${k}: modificato`;
          const change = v as { before?: unknown; after?: unknown };
          return `${k}: ${show(change?.before)} → ${show(change?.after)}`;
        })
      : entries
          .filter(([, v]) => v !== null && v !== "" && v !== false)
          .map(([k, v]) => (isRedacted(k, entity) ? `${k}: (riservato)` : `${k}: ${show(v)}`));
  return lines.length > max
    ? [...lines.slice(0, max), `… e altri ${lines.length - max} campi`]
    : lines;
}

/** La persona interessata dalla riga (se c'è): il profilo modificato o il profile_id del record. */
export function subjectProfileId(
  entity: string,
  entityId: string | null,
  diff: unknown,
): string | null {
  // Per le note riservate l'id della riga è quello della persona.
  if (entity === "profiles" || entity === "profile_admin_notes") return entityId;
  const d = (diff ?? {}) as Record<string, unknown>;
  const pid = d.profile_id as unknown;
  if (typeof pid === "string") return pid;
  if (pid && typeof pid === "object" && "after" in (pid as object))
    return ((pid as { after?: string }).after ?? null) as string | null;
  return null;
}
