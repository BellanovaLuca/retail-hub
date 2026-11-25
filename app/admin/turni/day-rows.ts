/**
 * Logica pura del salvataggio dei turni (senza database): dalle fasce scritte dall'admin alle
 * righe di `shifts` di una giornata, e scelta di cosa copiare da una settimana all'altra.
 * Le scritture le fa `actions.ts` con la RPC `replace_shift_days` (una transazione per lotto).
 */

export type Segment = { start: string; end: string; isBackOffice?: boolean | null };

export type DayOptions = {
  templateId?: string | null;
  breakMinutes?: number;
  departmentId?: string | null;
  zone?: "vista" | "sole" | null;
  note?: string | null;
  isBackOffice?: boolean | null;
  /**
   * Dal foglio (digitazione, incolla, riempimento): se le fasce sono le stesse già salvate si
   * conservano pausa, back office, area, reparto e nota di ogni pezzo, perché la cella non li
   * mostra e riscrivere lo stesso orario non deve azzerarli.
   */
  keepDetailsIfSameTimes?: boolean;
};

/** Turno già salvato (colonne di `shifts` che servono qui). */
export type ExistingShift = {
  template_id: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  working_as_department_id: string | null;
  zone: "vista" | "sole" | null;
  is_back_office: boolean | null;
  note: string | null;
};

/** Riga da inserire (parametro `p_rows` di `replace_shift_days`). */
export type DayRow = {
  profile_id: string;
  date: string;
  template_id: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  working_as_department_id: string | null;
  zone: "vista" | "sole" | null;
  is_back_office: boolean | null;
  note: string | null;
};

const hhmm = (t: string) => t.slice(0, 5);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const duration = (s: { start: string; end: string }) => minutes(s.end) - minutes(s.start);

/** Come `order by start_time` in Postgres: per orario d'inizio, le assenze (senza orario) in fondo. */
function byStart(a: ExistingShift, b: ExistingShift) {
  if (a.start_time === null) return b.start_time === null ? 0 : 1;
  if (b.start_time === null) return -1;
  return a.start_time.localeCompare(b.start_time);
}

/**
 * Il pezzo a cui va la pausa esplicita: il più lungo tra quelli NON in back office (a parità il
 * primo); se sono tutti in back office, il più lungo in assoluto. I vuoti tra pezzi sono già pausa.
 */
export function breakSegmentIndex(
  segments: { start: string; end: string; backOffice: boolean | null }[],
): number {
  const pick = (candidates: number[]) =>
    candidates.reduce(
      (best, i) => (best < 0 || duration(segments[i]) > duration(segments[best]) ? i : best),
      -1,
    );
  const all = segments.map((_, i) => i);
  const sale = all.filter((i) => segments[i].backOffice !== true);
  return pick(sale.length ? sale : all);
}

/**
 * Righe che sostituiscono i turni di una persona in un giorno. Reparto, area, back office e nota
 * non indicati si ereditano dalla giornata precedente; nessuna fascia e nessun turno rapido =
 * giornata vuota.
 */
export function buildDayRows(
  profileId: string,
  date: string,
  existing: ExistingShift[],
  segments: Segment[],
  opts: DayOptions,
  homeZone: "vista" | "sole" | "jolly" | undefined,
): DayRow[] {
  if (segments.length === 0 && !opts.templateId) return [];
  const sortedExisting = [...existing].sort(byStart);
  const prev = sortedExisting[0];

  const zone =
    opts.zone !== undefined
      ? opts.zone
      : (prev?.zone ?? (homeZone && homeZone !== "jolly" ? homeZone : null));
  const base = {
    profile_id: profileId,
    date,
    working_as_department_id:
      opts.departmentId !== undefined
        ? opts.departmentId
        : (prev?.working_as_department_id ?? null),
    zone,
    note: opts.note !== undefined ? opts.note : (prev?.note ?? null),
  };

  if (segments.length === 0) {
    return [
      {
        ...base,
        template_id: opts.templateId!,
        start_time: null,
        end_time: null,
        break_minutes: 0,
        is_back_office: null,
      },
    ];
  }

  const sorted = [...segments].sort((a, b) => a.start.localeCompare(b.start));
  const templateId = sorted.length === 1 ? (opts.templateId ?? null) : null;

  // Stesse fasce di prima: dal foglio si conservano i dettagli di ogni pezzo.
  const work = sortedExisting.filter((s) => s.start_time && s.end_time);
  const sameTimes =
    work.length === sorted.length &&
    sorted.every(
      (seg, i) =>
        hhmm(work[i].start_time!) === hhmm(seg.start) && hhmm(work[i].end_time!) === hhmm(seg.end),
    );
  // Scrivere il codice di un turno rapido diverso da quello salvato è invece una scelta nuova:
  // valgono la pausa e i dettagli del turno rapido.
  const sameTemplate = templateId === null || work[0]?.template_id === templateId;
  if (opts.keepDetailsIfSameTimes && sameTimes && sameTemplate) {
    return sorted.map((seg, i) => ({
      profile_id: profileId,
      date,
      template_id: templateId,
      start_time: seg.start,
      end_time: seg.end,
      break_minutes: work[i].break_minutes,
      working_as_department_id: work[i].working_as_department_id,
      zone: work[i].zone,
      is_back_office: work[i].is_back_office,
      note: work[i].note,
    }));
  }

  const backOffice = sorted.map((seg) =>
    seg.isBackOffice !== undefined
      ? seg.isBackOffice
      : opts.isBackOffice !== undefined
        ? opts.isBackOffice
        : (prev?.is_back_office ?? null),
  );
  const breakAt = breakSegmentIndex(
    sorted.map((seg, i) => ({ start: seg.start, end: seg.end, backOffice: backOffice[i] })),
  );
  return sorted.map((seg, i) => ({
    ...base,
    template_id: templateId,
    start_time: seg.start,
    end_time: seg.end,
    break_minutes: i === breakAt ? (opts.breakMinutes ?? 0) : 0,
    is_back_office: backOffice[i],
  }));
}

/* ------------------------------------------------------------ copia di settimane */

/** Turno sorgente di una copia (settimana precedente o modello di settimana). */
export type CopySource = {
  profile_id: string;
  date: string;
  template_id: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  working_as_department_id: string | null;
  zone: "vista" | "sole" | null;
  is_back_office: boolean | null;
  note: string | null;
};

export type CopyContext = {
  /** I 7 giorni della settimana di destinazione. */
  days: string[];
  /** Persone attive. */
  activeIds: Set<string>;
  /** Chiavi "persona|data" già occupate: turni presenti o assenze a giornata intera. */
  taken: Set<string>;
  /** Turni rapidi esistenti: id → codice e tipo. */
  templates: Map<string, { code: string; isAbsence: boolean }>;
  /** Reparti esistenti. */
  departmentIds: Set<string>;
  /**
   * "rest": tra le giornate di assenza si copia solo il riposo (codice R): ferie, malattia e
   * permessi di una settimana non valgono per quella dopo. "all": si copiano tutte.
   */
  absences: "rest" | "all";
};

export const REST_TEMPLATE_CODE = "R";

/**
 * Righe da copiare nelle giornate ancora libere. I riferimenti a turni rapidi o reparti che non
 * esistono più vengono tolti (un modello vecchio non deve far fallire tutta la copia); una
 * giornata di assenza rimasta senza turno rapido si salta.
 */
export function planCopyRows(source: CopySource[], ctx: CopyContext): CopySource[] {
  const out: CopySource[] = [];
  for (const s of source) {
    if (!ctx.activeIds.has(s.profile_id) || !ctx.days.includes(s.date)) continue;
    if (ctx.taken.has(`${s.profile_id}|${s.date}`)) continue;
    const template = s.template_id ? ctx.templates.get(s.template_id) : undefined;
    const isWork = Boolean(s.start_time && s.end_time);
    if (!isWork) {
      if (!template) continue;
      if (ctx.absences === "rest" && template.code.toUpperCase() !== REST_TEMPLATE_CODE) continue;
    }
    out.push({
      profile_id: s.profile_id,
      date: s.date,
      template_id: template ? s.template_id : null,
      start_time: isWork ? s.start_time : null,
      end_time: isWork ? s.end_time : null,
      break_minutes: s.break_minutes ?? 0,
      working_as_department_id:
        s.working_as_department_id && ctx.departmentIds.has(s.working_as_department_id)
          ? s.working_as_department_id
          : null,
      zone: s.zone ?? null,
      is_back_office: s.is_back_office ?? null,
      note: s.note ?? null,
    });
  }
  return out;
}
