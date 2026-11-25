import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  cellText,
  diffSnapshots,
  publishRecipients,
  resolveBackOffice,
} from "@/lib/schedule/cells";
import { parseShiftCell } from "@/lib/shifts/parse";
import type {
  PublishedShift,
  SchedulePerson,
  ShiftRecord,
  TemplateRecord,
} from "@/lib/schedule/types";

const MON = "2027-05-10";
const TUE = "2027-05-11";
const WED = "2027-05-12";

let n = 0;
const shift = (
  profileId: string,
  date: string,
  start: string | null,
  end: string | null,
  extra: Partial<ShiftRecord> = {},
): ShiftRecord => ({
  id: `s${++n}`,
  profileId,
  date,
  templateId: null,
  start,
  end,
  breakMinutes: 0,
  departmentId: null,
  zone: null,
  isBackOffice: null,
  note: null,
  conflict: false,
  ...extra,
});

const templates = new Map<string, TemplateRecord>();
const people = new Map<string, SchedulePerson>([
  [
    "p-a",
    {
      id: "p-a",
      displayName: "Anna",
      shortLabel: "ANN",
      color: null,
      homeZone: "vista",
      weeklyHours: 40,
      countsForCoverage: true,
      primaryDepartmentId: "d-1",
      departmentIds: ["d-1"],
    },
  ],
  [
    "p-j",
    {
      id: "p-j",
      displayName: "Marco",
      shortLabel: "MAR",
      color: null,
      homeZone: "jolly",
      weeklyHours: 30,
      countsForCoverage: true,
      primaryDepartmentId: "d-1",
      departmentIds: ["d-1"],
    },
  ],
]);

const dayOf = (snapshot: PublishedShift[], profileId: string, date: string) =>
  snapshot.filter((s) => s.profile_id === profileId && s.date === date);

describe("buildSnapshot: badge «Modificato» (§5)", () => {
  const first = buildSnapshot(
    [
      shift("p-a", MON, "10:00", "14:00"),
      shift("p-a", TUE, "10:00", "14:00"),
      shift("p-j", MON, "12:00", "16:00", { zone: "sole" }),
    ],
    templates,
    people,
    [],
  );

  // Alla prima pubblicazione ogni giornata risulta "nuova" rispetto al nulla: publishSnapshot
  // azzera i badge della versione 1, qui si fa lo stesso.
  const v1 = { ...first, snapshot: first.snapshot.map((s) => ({ ...s, changed: false })) };

  it("rispetto al nulla ogni giornata è una modifica (prima pubblicazione)", () => {
    expect(first.changes).toHaveLength(3);
    expect(first.changes.every((c) => c.before === "Libero")).toBe(true);
  });

  it("segna solo le giornate cambiate rispetto alla versione precedente", () => {
    const v2 = buildSnapshot(
      [
        shift("p-a", MON, "10:00", "14:00"),
        shift("p-a", TUE, "12:00", "20:00"), // orario cambiato
        shift("p-j", MON, "12:00", "16:00", { zone: "vista" }), // area cambiata
      ],
      templates,
      people,
      v1.snapshot,
    );
    expect(v2.changes.map((c) => `${c.profileId}|${c.date}`)).toEqual(["p-j|" + MON, "p-a|" + TUE]);
    expect(dayOf(v2.snapshot, "p-a", MON)[0].changed).toBe(false);
    expect(dayOf(v2.snapshot, "p-a", TUE)[0].changed).toBe(true);
    expect(dayOf(v2.snapshot, "p-j", MON)[0].changed).toBe(true);
  });

  it("una ripubblicazione senza modifiche conserva i badge precedenti", () => {
    const shifts = [
      shift("p-a", MON, "10:00", "14:00"),
      shift("p-a", TUE, "12:00", "20:00"),
      shift("p-j", MON, "12:00", "16:00", { zone: "vista" }),
    ];
    const v2 = buildSnapshot(shifts, templates, people, v1.snapshot);
    const v3 = buildSnapshot(shifts, templates, people, v2.snapshot);
    expect(v3.changes).toEqual([]);
    expect(dayOf(v3.snapshot, "p-a", MON)[0].changed).toBe(false);
    expect(dayOf(v3.snapshot, "p-a", TUE)[0].changed).toBe(true);
    expect(dayOf(v3.snapshot, "p-j", MON)[0].changed).toBe(true);
  });

  it("una modifica successiva si aggiunge ai badge già presenti", () => {
    const v2 = buildSnapshot(
      [shift("p-a", MON, "10:00", "14:00"), shift("p-a", TUE, "12:00", "20:00")],
      templates,
      people,
      v1.snapshot,
    );
    const v3 = buildSnapshot(
      [
        shift("p-a", MON, "10:00", "14:00"),
        shift("p-a", TUE, "12:00", "20:00"),
        shift("p-a", WED, "10:00", "14:00"), // giornata nuova
      ],
      templates,
      people,
      v2.snapshot,
    );
    expect(v3.changes.map((c) => c.date)).toEqual([WED]);
    expect(dayOf(v3.snapshot, "p-a", TUE)[0].changed).toBe(true);
    expect(dayOf(v3.snapshot, "p-a", WED)[0].changed).toBe(true);
    expect(dayOf(v3.snapshot, "p-a", MON)[0].changed).toBe(false);
  });

  it("ripubblicazione parziale: le giornate escluse restano come nella versione precedente", () => {
    // Come publishSnapshot con `onlyDays`: le giornate non toccate si riprendono dalla
    // versione precedente così come sono, badge compreso.
    const v2 = buildSnapshot(
      [shift("p-a", MON, "10:00", "14:00"), shift("p-a", TUE, "12:00", "20:00")],
      templates,
      people,
      v1.snapshot,
    );
    const full = buildSnapshot(
      [shift("p-a", MON, "09:00", "13:00"), shift("p-a", TUE, "14:00", "20:00")],
      templates,
      people,
      v2.snapshot,
    );
    const only = new Set([`p-a|${MON}`]);
    const inOnly = (s: PublishedShift) => only.has(`${s.profile_id}|${s.date}`);
    const partial = [...v2.snapshot.filter((s) => !inOnly(s)), ...full.snapshot.filter(inOnly)];
    expect(dayOf(partial, "p-a", MON)[0].start_time).toBe("09:00");
    expect(dayOf(partial, "p-a", MON)[0].changed).toBe(true);
    expect(dayOf(partial, "p-a", TUE)[0].start_time).toBe("12:00");
    expect(dayOf(partial, "p-a", TUE)[0].changed).toBe(true);
  });
});

describe("diffSnapshots", () => {
  it("descrive prima e dopo in forma leggibile", () => {
    const before = buildSnapshot([shift("p-a", MON, "10:00", "14:00")], templates, people, []);
    const after = buildSnapshot([], templates, people, before.snapshot);
    expect(diffSnapshots(before.snapshot, after.snapshot)).toEqual([
      { profileId: "p-a", date: MON, before: "10:00–14:00", after: "Libero" },
    ]);
  });
});

describe("diffSnapshots: dettagli e ordine", () => {
  const snap = (shifts: ShiftRecord[], previous: PublishedShift[] = []) =>
    buildSnapshot(shifts, templates, people, previous).snapshot;

  it("l'ordine dei pezzi non conta", () => {
    const a = shift("p-j", MON, "10:00", "14:00", { zone: "vista" });
    const b = shift("p-j", MON, "16:00", "20:00", { zone: "sole" });
    expect(diffSnapshots(snap([a, b]), snap([b, a]))).toEqual([]);
  });

  it("pausa e back office cambiati sono modifiche, con il dettaglio nel prima e dopo", () => {
    const base = shift("p-a", MON, "10:00", "20:00", { breakMinutes: 60 });
    expect(diffSnapshots(snap([base]), snap([{ ...base, breakMinutes: 0 }]))).toEqual([
      {
        profileId: "p-a",
        date: MON,
        before: "10:00–20:00 (Vista, pausa 60′)",
        after: "10:00–20:00 (Vista)",
      },
    ]);
    expect(diffSnapshots(snap([base]), snap([{ ...base, isBackOffice: true }]))).toEqual([
      {
        profileId: "p-a",
        date: MON,
        before: "10:00–20:00 (Vista, pausa 60′)",
        after: "10:00–20:00 (Vista, pausa 60′, back office)",
      },
    ]);
    // Area di un jolly: stesso orario, si legge quale area è cambiata.
    const j = shift("p-j", TUE, "10:00", "14:00", { zone: "vista" });
    expect(diffSnapshots(snap([j]), snap([{ ...j, zone: "sole" }]))).toEqual([
      { profileId: "p-j", date: TUE, before: "10:00–14:00 (Vista)", after: "10:00–14:00 (Sole)" },
    ]);
  });

  it("la pausa conta per giornata: spostarla da un pezzo all'altro non è una modifica", () => {
    const a = shift("p-a", MON, "10:00", "13:00", { breakMinutes: 30 });
    const b = shift("p-a", MON, "14:00", "19:00");
    expect(
      diffSnapshots(
        snap([a, b]),
        snap([
          { ...a, breakMinutes: 0 },
          { ...b, breakMinutes: 30 },
        ]),
      ),
    ).toEqual([]);
  });

  it("persona disattivata (non più in elenco): nessuna modifica fantasma alla ripubblicazione", () => {
    const paola: SchedulePerson = {
      id: "p-x",
      displayName: "Paola",
      shortLabel: "PAO",
      color: null,
      homeZone: "sole",
      weeklyHours: 40,
      countsForCoverage: false,
      primaryDepartmentId: "d-2",
      departmentIds: ["d-2"],
    };
    const s = shift("p-x", MON, "10:00", "20:00");
    const first = buildSnapshot([s], templates, new Map([...people, ["p-x", paola]]), []);
    expect(first.snapshot[0]).toMatchObject({
      zone: "sole",
      is_back_office: true,
      department_id: "d-2",
    });
    const second = buildSnapshot([s], templates, people, first.snapshot);
    expect(second.changes).toEqual([]);
    expect(second.snapshot[0]).toMatchObject({
      zone: "sole",
      is_back_office: true,
      department_id: "d-2",
    });
  });
});

describe("publishRecipients (ripubblicazione con «notifica tutti»)", () => {
  it("comprende chi è stato tolto dalla settimana", () => {
    const before = buildSnapshot(
      [shift("p-a", MON, "10:00", "14:00"), shift("p-j", MON, "10:00", "14:00", { zone: "sole" })],
      templates,
      people,
      [],
    );
    // Marco non ha più turni: non è nell'istantanea, ma è tra le giornate cambiate.
    const after = buildSnapshot(
      [shift("p-a", MON, "10:00", "14:00")],
      templates,
      people,
      before.snapshot,
    );
    expect(after.snapshot.map((s) => s.profile_id)).toEqual(["p-a"]);
    expect(after.changes).toMatchObject([{ profileId: "p-j", after: "Libero" }]);
    expect(publishRecipients(after.snapshot, after.changes).sort()).toEqual(["p-a", "p-j"]);
  });
});

describe("cellText: giornata «back office + vendita»", () => {
  const anna = people.get("p-a");
  const backOfficeOf = (s: ShiftRecord) => resolveBackOffice(s, anna);
  it("porta il marcatore BO e, riparsata, dà gli stessi pezzi (copia/incolla, annulla)", () => {
    const day = [
      shift("p-a", MON, "10:00", "17:30"),
      shift("p-a", MON, "08:30", "10:00", { isBackOffice: true }),
    ];
    const text = cellText(day, templates, backOfficeOf);
    expect(text).toBe("8:30–10 BO · 10–17:30");
    expect(parseShiftCell(text, [])).toEqual({
      kind: "times",
      segments: [
        { start: "08:30", end: "10:00", isBackOffice: true },
        { start: "10:00", end: "17:30", isBackOffice: false },
      ],
    });
  });
  it("giornate tutte in vendita o tutte in back office restano senza marcatore", () => {
    expect(cellText([shift("p-a", MON, "10:00", "19:00")], templates, backOfficeOf)).toBe("10–19");
    expect(
      cellText(
        [shift("p-a", MON, "10:00", "19:00", { isBackOffice: true })],
        templates,
        backOfficeOf,
      ),
    ).toBe("10–19");
    expect(cellText([shift("p-a", MON, "10:00", "19:00")], templates)).toBe("10–19");
  });
});
