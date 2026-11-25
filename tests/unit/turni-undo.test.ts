/**
 * Foglio turni: Canc + Annulla (e l'annulla dopo aver riscritto una cella) riportano la giornata
 * com'era — orari, pausa, nota, area, reparto, back office, turno rapido.
 */
import { describe, expect, it } from "vitest";
import {
  buildDayRows,
  restoredDayRows,
  type ExistingShift,
  type RestoreRow,
} from "@/app/admin/turni/day-rows";
import { createCellMemory, snapshotOf } from "@/app/admin/turni/[week]/cell-restore";
import { cellText } from "@/lib/schedule/cells";
import type { ShiftRecord, TemplateRecord } from "@/lib/schedule/types";
import { parseShiftCell } from "@/lib/shifts/parse";

const P = "00000000-0000-0000-0000-0000000000e1";
const D = "2026-11-30";
const DEP = "00000000-0000-0000-0000-0000000000d1";
const MAN = "00000000-0000-0000-0000-000000000701";
const REST = "00000000-0000-0000-0000-000000000702";
const known = { templateIds: new Set([MAN, REST]), departmentIds: new Set([DEP]) };

const record = (over: Partial<ShiftRecord>): ShiftRecord => ({
  id: `s-${over.start ?? "x"}`,
  profileId: P,
  date: D,
  templateId: null,
  start: "10:00",
  end: "19:00",
  breakMinutes: 0,
  departmentId: null,
  zone: null,
  isBackOffice: null,
  note: null,
  conflict: false,
  ...over,
});
const templates = new Map<string, TemplateRecord>([
  [
    MAN,
    {
      id: MAN,
      code: "MAN",
      label: "Manager",
      startTime: "10:00",
      endTime: "20:00",
      breakMinutes: 60,
      isAbsence: false,
    },
  ],
  [
    REST,
    {
      id: REST,
      code: "R",
      label: "Riposo",
      startTime: null,
      endTime: null,
      breakMinutes: 0,
      isAbsence: true,
    },
  ],
]);
const tplInput = [...templates.values()];

/** Quello che fa il server con una cella (stessa logica di `saveShiftCells`). */
function saveCell(text: string, existing: ExistingShift[], restore?: RestoreRow[]) {
  const parsed = parseShiftCell(text, tplInput);
  if (parsed.kind === "empty") return [];
  if (parsed.kind === "error") throw new Error(parsed.message);
  const tpl = parsed.kind === "template" ? tplInput.find((t) => t.code === parsed.code)! : null;
  const segments =
    parsed.kind === "times"
      ? parsed.segments
      : tpl!.startTime && tpl!.endTime
        ? [{ start: tpl!.startTime, end: tpl!.endTime }]
        : [];
  const expected = { templateId: tpl?.id ?? null, segments };
  return (
    (restore ? restoredDayRows(P, D, expected, restore, known) : null) ??
    buildDayRows(
      P,
      D,
      existing,
      segments,
      {
        templateId: tpl?.id ?? null,
        breakMinutes: tpl?.breakMinutes ?? 0,
        keepDetailsIfSameTimes: true,
      },
      "vista",
    )
  );
}

describe("Canc + Annulla nel foglio turni", () => {
  // Giornata «apre in back office, poi vendita», con pausa, nota, area e reparto.
  const day = [
    record({ start: "08:30", end: "10:00", isBackOffice: true, zone: "sole", note: "inventario" }),
    record({
      start: "10:00",
      end: "18:30",
      isBackOffice: false,
      breakMinutes: 60,
      zone: "sole",
      departmentId: DEP,
      note: "inventario",
    }),
  ];
  const text = cellText(day, templates, (s) => Boolean(s.isBackOffice));
  const snapshot = snapshotOf(day);

  it("senza le righe ricordate l'annulla riporta solo orari e back office (il limite di prima)", () => {
    const rows = saveCell(text, []);
    expect(rows.map((r) => [r.start_time, r.end_time, r.is_back_office])).toEqual([
      ["08:30", "10:00", true],
      ["10:00", "18:30", false],
    ]);
    expect(rows.map((r) => [r.break_minutes, r.note, r.zone])).toEqual([
      [0, null, "vista"],
      [0, null, "vista"],
    ]);
  });

  it("con le righe ricordate la giornata torna identica", () => {
    expect(text).toBe("8:30–10 BO · 10–18:30");
    const rows = saveCell(text, [], snapshot);
    expect(rows).toEqual([
      {
        profile_id: P,
        date: D,
        template_id: null,
        start_time: "08:30",
        end_time: "10:00",
        break_minutes: 0,
        working_as_department_id: null,
        zone: "sole",
        is_back_office: true,
        note: "inventario",
      },
      {
        profile_id: P,
        date: D,
        template_id: null,
        start_time: "10:00",
        end_time: "18:30",
        break_minutes: 60,
        working_as_department_id: DEP,
        zone: "sole",
        is_back_office: false,
        note: "inventario",
      },
    ]);
  });

  it("vale anche dopo aver riscritto la cella con un altro orario", () => {
    // La cella è stata riscritta «9-18» (pausa e nota di prima perse, come sempre): Annulla.
    const rewritten = saveCell("9-18", day.map(toExisting));
    expect(rewritten[0].break_minutes).toBe(0);
    const undone = saveCell(text, rewritten, snapshot);
    expect(undone.map((r) => [r.start_time, r.break_minutes, r.note])).toEqual([
      ["08:30", 0, "inventario"],
      ["10:00", 60, "inventario"],
    ]);
  });

  it("turno rapido con orario: torna con la sua pausa cambiata a mano e la nota", () => {
    const man = [record({ templateId: MAN, end: "20:00", breakMinutes: 30, note: "riunione" })];
    expect(cellText(man, templates)).toBe("MAN");
    const rows = saveCell("MAN", [], snapshotOf(man));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ template_id: MAN, break_minutes: 30, note: "riunione" });
  });

  it("riposo con nota: torna il riposo con la nota", () => {
    const rest = [record({ templateId: REST, start: null, end: null, note: "recupero" })];
    expect(cellText(rest, templates)).toBe("R");
    expect(saveCell("R", [], snapshotOf(rest))).toEqual([
      {
        profile_id: P,
        date: D,
        template_id: REST,
        start_time: null,
        end_time: null,
        break_minutes: 0,
        working_as_department_id: null,
        zone: null,
        is_back_office: null,
        note: "recupero",
      },
    ]);
  });
});

function toExisting(s: ShiftRecord): ExistingShift {
  return {
    template_id: s.templateId,
    start_time: s.start,
    end_time: s.end,
    break_minutes: s.breakMinutes,
    working_as_department_id: s.departmentId,
    zone: s.zone,
    is_back_office: s.isBackOffice,
    note: s.note,
  };
}

describe("restoredDayRows: le righe valgono solo se dicono la stessa cosa del testo", () => {
  const row = (over: Partial<RestoreRow> = {}): RestoreRow => ({
    template_id: null,
    start_time: "10:00",
    end_time: "19:00",
    break_minutes: 60,
    working_as_department_id: DEP,
    zone: "vista",
    is_back_office: null,
    note: "n",
    ...over,
  });
  const times = (start: string, end: string) => ({ templateId: null, segments: [{ start, end }] });

  it("orari diversi dal testo, numero di pezzi diverso o nessuna riga: null", () => {
    expect(restoredDayRows(P, D, times("10:00", "18:00"), [row()], known)).toBeNull();
    expect(restoredDayRows(P, D, times("10:00", "19:00"), [row(), row()], known)).toBeNull();
    expect(restoredDayRows(P, D, times("10:00", "19:00"), [], known)).toBeNull();
    // Riga di assenza per un testo con orari, e viceversa.
    expect(
      restoredDayRows(
        P,
        D,
        times("10:00", "19:00"),
        [row({ start_time: null, end_time: null, template_id: REST })],
        known,
      ),
    ).toBeNull();
    expect(restoredDayRows(P, D, { templateId: REST, segments: [] }, [row()], known)).toBeNull();
  });

  it("il codice di un turno rapido vale solo se la riga era quel turno rapido", () => {
    const man = { templateId: MAN, segments: [{ start: "10:00", end: "20:00" }] };
    expect(restoredDayRows(P, D, man, [row({ end_time: "20:00" })], known)).toBeNull();
    expect(
      restoredDayRows(P, D, man, [row({ end_time: "20:00", template_id: MAN })], known),
    ).toHaveLength(1);
  });

  it("orari con i secondi (come li dà il database) e pezzi in disordine vanno bene", () => {
    const rows = restoredDayRows(
      P,
      D,
      {
        templateId: null,
        segments: [
          { start: "15:00", end: "19:00" },
          { start: "10:00", end: "14:00" },
        ],
      },
      [
        row({ start_time: "15:00:00", end_time: "19:00:00", break_minutes: 0 }),
        row({ start_time: "10:00:00", end_time: "14:00:00", break_minutes: 30 }),
      ],
      known,
    );
    expect(rows?.map((r) => [r.start_time, r.end_time, r.break_minutes])).toEqual([
      ["10:00", "14:00", 30],
      ["15:00", "19:00", 0],
    ]);
  });

  it("turni rapidi e reparti che non esistono più vengono tolti, il resto torna", () => {
    const rows = restoredDayRows(
      P,
      D,
      times("10:00", "19:00"),
      [
        row({
          template_id: "00000000-0000-0000-0000-0000000009ff",
          working_as_department_id: "00000000-0000-0000-0000-0000000009fe",
        }),
      ],
      known,
    );
    expect(rows?.[0]).toMatchObject({
      template_id: null,
      working_as_department_id: null,
      break_minutes: 60,
      note: "n",
    });
  });
});

describe("memoria delle giornate", () => {
  it("ricorda per cella e per testo; l'ultima versione di un testo vince", () => {
    const memory = createCellMemory();
    const a = snapshotOf([record({ breakMinutes: 60 })]);
    const b = snapshotOf([record({ breakMinutes: 30 })]);
    memory.remember("p|d", "10–19", a);
    expect(memory.recall("p|d", "10–19")).toBe(a);
    expect(memory.recall("p|d", "9–18")).toBeUndefined();
    expect(memory.recall("altra|d", "10–19")).toBeUndefined();
    memory.remember("p|d", "10–19", b);
    expect(memory.recall("p|d", "10–19")).toBe(b);
  });

  it("una cella vuota non si ricorda; per cella restano gli ultimi testi", () => {
    const memory = createCellMemory();
    memory.remember("p|d", "", []);
    memory.remember("p|d", "10–19", []);
    expect(memory.recall("p|d", "")).toBeUndefined();
    expect(memory.recall("p|d", "10–19")).toBeUndefined();
    const rows = snapshotOf([record({})]);
    for (let i = 0; i < 20; i++) memory.remember("p|d", `testo ${i}`, rows);
    expect(memory.recall("p|d", "testo 0")).toBeUndefined();
    expect(memory.recall("p|d", "testo 19")).toBe(rows);
  });
});
