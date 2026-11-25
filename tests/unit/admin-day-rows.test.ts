import { describe, expect, it } from "vitest";
import {
  breakSegmentIndex,
  buildDayRows,
  planCopyRows,
  type CopyContext,
  type CopySource,
  type ExistingShift,
} from "@/app/admin/turni/day-rows";

const P = "00000000-0000-0000-0000-0000000000e1";
const D = "2027-03-05";
const TPL = "00000000-0000-0000-0000-000000000701";

function existing(over: Partial<ExistingShift> = {}): ExistingShift {
  return {
    template_id: null,
    start_time: "10:00:00",
    end_time: "19:00:00",
    break_minutes: 0,
    working_as_department_id: null,
    zone: null,
    is_back_office: null,
    note: null,
    ...over,
  };
}

describe("buildDayRows · stesse fasce dal foglio", () => {
  it("riscrivere lo stesso orario conserva pausa, back office, area, reparto e nota", () => {
    const rows = buildDayRows(
      P,
      D,
      [
        existing({
          break_minutes: 45,
          is_back_office: true,
          zone: "sole",
          working_as_department_id: "dep-1",
          note: "inventario",
        }),
      ],
      [{ start: "10:00", end: "19:00" }],
      { templateId: null, breakMinutes: 0, keepDetailsIfSameTimes: true },
      "vista",
    );
    expect(rows).toEqual([
      {
        profile_id: P,
        date: D,
        template_id: null,
        start_time: "10:00",
        end_time: "19:00",
        break_minutes: 45,
        working_as_department_id: "dep-1",
        zone: "sole",
        is_back_office: true,
        note: "inventario",
      },
    ]);
  });

  it("conserva i dettagli pezzo per pezzo negli spezzati, in qualsiasi ordine arrivino", () => {
    const rows = buildDayRows(
      P,
      D,
      [
        existing({ start_time: "15:00:00", end_time: "20:00:00", break_minutes: 30, note: "pm" }),
        existing({ start_time: "09:00:00", end_time: "13:00:00", is_back_office: true }),
      ],
      [
        { start: "15:00", end: "20:00" },
        { start: "09:00", end: "13:00" },
      ],
      { templateId: null, breakMinutes: 0, keepDetailsIfSameTimes: true },
      undefined,
    );
    expect(rows.map((r) => [r.start_time, r.break_minutes, r.is_back_office, r.note])).toEqual([
      ["09:00", 0, true, null],
      ["15:00", 30, null, "pm"],
    ]);
  });

  it("ridigitare il codice dello stesso turno rapido non azzera la pausa corretta a mano", () => {
    const rows = buildDayRows(
      P,
      D,
      [existing({ template_id: TPL, break_minutes: 30 })],
      [{ start: "10:00", end: "19:00" }],
      { templateId: TPL, breakMinutes: 60, keepDetailsIfSameTimes: true },
      undefined,
    );
    expect(rows[0]).toMatchObject({ template_id: TPL, break_minutes: 30 });
  });

  it("scrivere un turno rapido DIVERSO applica la pausa del turno rapido", () => {
    const rows = buildDayRows(
      P,
      D,
      [existing({ template_id: null, break_minutes: 0 })],
      [{ start: "10:00", end: "19:00" }],
      { templateId: TPL, breakMinutes: 60, keepDetailsIfSameTimes: true },
      undefined,
    );
    expect(rows[0]).toMatchObject({ template_id: TPL, break_minutes: 60 });
  });

  it("orario cambiato: la pausa non si eredita, reparto area e nota sì", () => {
    const rows = buildDayRows(
      P,
      D,
      [existing({ break_minutes: 45, zone: "sole", note: "inventario" })],
      [{ start: "10:00", end: "18:00" }],
      { templateId: null, breakMinutes: 0, keepDetailsIfSameTimes: true },
      "vista",
    );
    expect(rows[0]).toMatchObject({
      end_time: "18:00",
      break_minutes: 0,
      zone: "sole",
      note: "inventario",
    });
  });

  it("dal dettaglio della giornata valgono i valori del form anche a orario invariato", () => {
    const rows = buildDayRows(
      P,
      D,
      [existing({ break_minutes: 45, zone: "sole", note: "vecchia" })],
      [{ start: "10:00", end: "19:00", isBackOffice: false }],
      { templateId: null, breakMinutes: 15, departmentId: null, zone: "vista", note: null },
      undefined,
    );
    expect(rows[0]).toMatchObject({
      break_minutes: 15,
      zone: "vista",
      note: null,
      is_back_office: false,
    });
  });
});

describe("buildDayRows · pausa negli spezzati", () => {
  it("la pausa va al pezzo più lungo, non al primo", () => {
    const rows = buildDayRows(
      P,
      D,
      [],
      [
        { start: "09:00", end: "11:00", isBackOffice: false },
        { start: "12:00", end: "19:00", isBackOffice: false },
      ],
      { templateId: null, breakMinutes: 30 },
      "vista",
    );
    expect(rows.map((r) => r.break_minutes)).toEqual([0, 30]);
  });

  it("tra i pezzi conta solo chi NON è in back office", () => {
    const segments = [
      { start: "08:00", end: "14:00", backOffice: true },
      { start: "15:00", end: "19:00", backOffice: false },
    ];
    expect(breakSegmentIndex(segments)).toBe(1);
    const rows = buildDayRows(
      P,
      D,
      [],
      [
        { start: "08:00", end: "14:00", isBackOffice: true },
        { start: "15:00", end: "19:00", isBackOffice: false },
      ],
      { templateId: null, breakMinutes: 30 },
      undefined,
    );
    expect(rows.map((r) => r.break_minutes)).toEqual([0, 30]);
  });

  it("tutti in back office: il più lungo in assoluto; a parità il primo", () => {
    expect(
      breakSegmentIndex([
        { start: "08:00", end: "10:00", backOffice: true },
        { start: "11:00", end: "16:00", backOffice: true },
      ]),
    ).toBe(1);
    expect(
      breakSegmentIndex([
        { start: "09:00", end: "13:00", backOffice: null },
        { start: "14:00", end: "18:00", backOffice: null },
      ]),
    ).toBe(0);
  });
});

describe("buildDayRows · casi base", () => {
  it("nessuna fascia e nessun turno rapido = giornata vuota", () => {
    expect(buildDayRows(P, D, [existing()], [], {}, "vista")).toEqual([]);
  });

  it("turno rapido di assenza: una riga senza orario", () => {
    const rows = buildDayRows(P, D, [], [], { templateId: TPL, breakMinutes: 0 }, "sole");
    expect(rows).toEqual([
      {
        profile_id: P,
        date: D,
        template_id: TPL,
        start_time: null,
        end_time: null,
        break_minutes: 0,
        working_as_department_id: null,
        zone: "sole",
        is_back_office: null,
        note: null,
      },
    ]);
  });

  it("area: quella di base della persona; i jolly restano senza", () => {
    const seg = [{ start: "10:00", end: "14:00" }];
    expect(buildDayRows(P, D, [], seg, {}, "vista")[0].zone).toBe("vista");
    expect(buildDayRows(P, D, [], seg, {}, "jolly")[0].zone).toBeNull();
  });

  it("il turno rapido vale solo per una fascia singola", () => {
    const rows = buildDayRows(
      P,
      D,
      [],
      [
        { start: "10:00", end: "13:00" },
        { start: "14:00", end: "19:00" },
      ],
      { templateId: TPL },
      undefined,
    );
    expect(rows.map((r) => r.template_id)).toEqual([null, null]);
  });
});

describe("planCopyRows", () => {
  const REST = "tpl-riposo";
  const FERIE = "tpl-ferie";
  const WORK = "tpl-lavoro";
  const days = ["2027-03-08", "2027-03-09", "2027-03-10"];
  const ctx = (over: Partial<CopyContext> = {}): CopyContext => ({
    days,
    activeIds: new Set(["a", "b"]),
    taken: new Set(),
    templates: new Map([
      [REST, { code: "R", isAbsence: true }],
      [FERIE, { code: "F", isAbsence: true }],
      [WORK, { code: "MAN", isAbsence: false }],
    ]),
    departmentIds: new Set(["dep-1"]),
    absences: "rest",
    ...over,
  });
  const src = (over: Partial<CopySource>): CopySource => ({
    profile_id: "a",
    date: days[0],
    template_id: null,
    start_time: "10:00:00",
    end_time: "19:00:00",
    break_minutes: 60,
    working_as_department_id: "dep-1",
    zone: "vista",
    is_back_office: null,
    note: null,
    ...over,
  });

  it("duplicando la settimana, tra le assenze si copia solo il riposo", () => {
    const rows = planCopyRows(
      [
        src({ date: days[0] }),
        src({ date: days[1], template_id: REST, start_time: null, end_time: null }),
        src({ date: days[2], template_id: FERIE, start_time: null, end_time: null }),
      ],
      ctx(),
    );
    expect(rows.map((r) => [r.date, r.template_id])).toEqual([
      [days[0], null],
      [days[1], REST],
    ]);
  });

  it("applicando un modello le assenze si copiano tutte", () => {
    const rows = planCopyRows(
      [src({ template_id: FERIE, start_time: null, end_time: null })],
      ctx({ absences: "all" }),
    );
    expect(rows).toHaveLength(1);
  });

  it("salta le giornate occupate, le persone non attive e i giorni fuori settimana", () => {
    const rows = planCopyRows(
      [
        src({ profile_id: "a", date: days[0] }),
        src({ profile_id: "b", date: days[0] }),
        src({ profile_id: "inattivo", date: days[1] }),
        src({ profile_id: "b", date: "2027-03-15" }),
      ],
      ctx({ taken: new Set([`a|${days[0]}`]) }),
    );
    expect(rows.map((r) => r.profile_id)).toEqual(["b"]);
  });

  it("toglie i riferimenti a turni rapidi e reparti eliminati invece di far fallire la copia", () => {
    const rows = planCopyRows(
      [
        src({ template_id: "eliminato", working_as_department_id: "reparto-eliminato" }),
        // Assenza il cui turno rapido non esiste più: non resta nulla da copiare.
        src({ date: days[1], template_id: "eliminato", start_time: null, end_time: null }),
      ],
      ctx({ absences: "all" }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      template_id: null,
      working_as_department_id: null,
      start_time: "10:00:00",
    });
  });
});
