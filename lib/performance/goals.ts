/**
 * Performance annuale (§6.1, §6.2): 3 obiettivi Achievement + 3 Leadership per persona e anno.
 * Logica pura: spazi, etichette, copia dal periodo precedente, applicazione a un reparto.
 */

export type Pillar = "achievement" | "leadership";
export type Progress = "non_iniziato" | "in_corso" | "raggiunto" | "non_raggiunto";

export const PILLARS: { id: Pillar; label: string; letter: "A" | "L" }[] = [
  { id: "achievement", label: "Achievement", letter: "A" },
  { id: "leadership", label: "Leadership", letter: "L" },
];

export const SLOTS: { pillar: Pillar; slot: 1 | 2 | 3; code: string }[] = PILLARS.flatMap((p) =>
  ([1, 2, 3] as const).map((slot) => ({ pillar: p.id, slot, code: `${p.letter}${slot}` })),
);

export const PROGRESS_LABELS: Record<Progress, string> = {
  non_iniziato: "Non iniziato",
  in_corso: "In corso",
  raggiunto: "Raggiunto",
  non_raggiunto: "Non raggiunto",
};

export const PROGRESS_VALUES = Object.keys(PROGRESS_LABELS) as Progress[];

/** "A1", "L3"… */
export function slotCode(pillar: Pillar, slot: number) {
  return `${pillar === "achievement" ? "A" : "L"}${slot}`;
}

export const slotKey = (pillar: Pillar, slot: number) => `${pillar}:${slot}`;

export function periodLabel(year: number) {
  return `Performance ${year}`;
}

type Defined = { title: string | null; objective: string | null };

/** Un obiettivo è definito se ha almeno il titolo o il testo. */
export function isGoalDefined(goal: Defined | undefined | null): boolean {
  return Boolean(goal && ((goal.title ?? "").trim() || (goal.objective ?? "").trim()));
}

export type SlotGoal = Defined & { pillar: Pillar; slot: number };

/**
 * "Copia obiettivi dal periodo precedente": per ogni spazio ancora vuoto nell'anno corrente
 * prende titolo e obiettivo dell'anno prima. Non sovrascrive mai uno spazio già compilato.
 */
export function planCopyFromPrevious(
  current: SlotGoal[],
  previous: SlotGoal[],
): { pillar: Pillar; slot: number; title: string; objective: string }[] {
  const now = new Map(current.map((g) => [slotKey(g.pillar, g.slot), g]));
  return previous
    .filter((g) => isGoalDefined(g) && !isGoalDefined(now.get(slotKey(g.pillar, g.slot))))
    .map((g) => ({
      pillar: g.pillar,
      slot: g.slot,
      title: (g.title ?? "").trim(),
      objective: (g.objective ?? "").trim(),
    }))
    .sort((a, b) => a.pillar.localeCompare(b.pillar) || a.slot - b.slot);
}

/**
 * "Applica gli stessi obiettivi a tutto il reparto": a chi scrivere. Senza `overwrite` chi ha
 * già un obiettivo in quello spazio resta com'è (lo si personalizza dopo).
 */
export function planApplyToDepartment(
  profileIds: string[],
  existing: Map<string, Defined | undefined>,
  overwrite: boolean,
): { write: string[]; skipped: string[] } {
  const write: string[] = [];
  const skipped: string[] = [];
  for (const id of profileIds) {
    if (!overwrite && isGoalDefined(existing.get(id))) skipped.push(id);
    else write.push(id);
  }
  return { write, skipped };
}

/** Riepilogo di pubblicazione di una persona: definiti, pubblicati, da pubblicare. */
export function publicationSummary(goals: (Defined & { published: boolean })[]) {
  const defined = goals.filter(isGoalDefined);
  const published = defined.filter((g) => g.published).length;
  return { defined: defined.length, published, toPublish: defined.length - published };
}

/** Anni proposti nel selettore: quelli con un periodo, più l'anno corrente e i vicini. */
export function yearOptions(existing: number[], current: number): number[] {
  return [...new Set([...existing, current - 1, current, current + 1])].sort((a, b) => b - a);
}
