import { describe, expect, it } from "vitest";
import { buildSnapshot, diffSnapshots } from "@/lib/schedule/cells";
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
