import { describe, expect, it } from "vitest";
import type { LeaveInput, PersonInput, ShiftInput } from "@/lib/domain/types";
import {
  describeRule,
  evaluateRules,
  getRuleType,
  resolveNumber,
  RULE_TYPES,
  validateRuleParams,
} from "@/lib/rules/registry";
import { STANDARD_RULE_SET, resolveSeedRules } from "@/lib/rules/seed";
import type { RuleContext, RuleRecord } from "@/lib/rules/types";

const WEEK = [
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
];
const [MON, TUE, WED, , , SAT, SUN] = WEEK;

const departments = [
  { id: "man", name: "Management" },
  { id: "ott", name: "Ottici" },
  { id: "adv", name: "Addetti vendita" },
];

const p = (id: string, homeZone: PersonInput["homeZone"], dep = "adv", weeklyHours = 40) => ({
  id,
  displayName: id[0].toUpperCase() + id.slice(1),
  weeklyHours,
  homeZone,
  departmentIds: [dep],
  primaryDepartmentId: dep,
});

const people: PersonInput[] = [
  p("sole1", "sole"),
  p("sole2", "sole"),
  p("vista1", "vista", "ott"),
  p("vista2", "vista"),
];

const sh = (
  profileId: string,
  date: string,
  start: string,
  end: string,
  extra: Partial<ShiftInput> = {},
): ShiftInput => ({
  profileId,
  date,
  start,
  end,
  breakMinutes: 0,
  zone: null,
  backOffice: false,
  departmentId: null,
  ...extra,
});

const opening = { start: "10:00", end: "20:00" };

function ctx(shifts: ShiftInput[], extra: Partial<RuleContext> = {}): RuleContext {
  return {
    weekStart: MON,
    days: [MON],
    shifts,
    leaves: [],
    people,
    departments,
    openingHours: {
      1: opening,
      2: opening,
      3: opening,
      4: opening,
      5: opening,
      6: opening,
      7: null,
    },
    holidays: [],
    variables: { min_sole_sera: 2 },
    ...extra,
  };
}

let seq = 0;
function rule(type: string, params: unknown, extra: Partial<RuleRecord> = {}): RuleRecord {
  seq++;
  return {
    id: `r${seq}`,
    name: `Regola ${seq}`,
    type,
    params,
    days: [],
    timeWindows: [],
    validFrom: null,
    validTo: null,
    severity: "warning",
    active: true,
    ...extra,
  };
}

const soleMin = (min: number | { var: string }, windows: { start: string; end: string }[]) =>
  rule(
    "min_presence",
    { scope: { kind: "zone", zone: "sole" }, min },
    { name: "Sole sera", timeWindows: windows },
  );

describe("registro dei tipi di regola", () => {
  it("contiene tutti i tipi iniziali, ognuno con schema, default validi e campi", () => {
    expect(RULE_TYPES.map((t) => t.type)).toEqual([
      "min_presence",
      "max_presence",
      "opening_presence",
      "max_on_leave",
      "weekly_hours_deviation",
      "min_rest_between_shifts",
      "max_consecutive_days",
      "min_weekly_rest_days",
      "mandatory_break",
    ]);
    for (const t of RULE_TYPES) {
      expect(t.parse(t.definition.defaultParams).ok, t.type).toBe(true);
      expect(t.definition.fields.length, t.type).toBeGreaterThan(0);
      expect(t.label).not.toBe("");
    }
  });

  it("validateRuleParams segnala tipo sconosciuto e parametri errati", () => {
    expect(validateRuleParams("boh", {})).toEqual({
      ok: false,
      error: 'tipo di regola "boh" sconosciuto',
    });
    const bad = validateRuleParams("min_presence", { scope: { kind: "zone", zone: "x" }, min: 1 });
    expect(bad.ok).toBe(false);
    expect(
      validateRuleParams("min_presence", { scope: { kind: "all" }, min: { var: "x" } }).ok,
    ).toBe(true);
  });

  it("resolveNumber: numero o variabile", () => {
    expect(resolveNumber(3, {})).toBe(3);
    expect(resolveNumber({ var: "min_vista" }, { min_vista: 2 })).toBe(2);
    expect(() => resolveNumber({ var: "manca" }, {})).toThrow(/non esiste/);
  });

  it("getRuleType", () => {
    expect(getRuleType("mandatory_break")?.label).toBe("Pausa obbligatoria");
    expect(getRuleType("nessuno")).toBeUndefined();
  });
});

describe("min_presence", () => {
  it("criterio §16: in Sole basta 1 persona in apertura, ne servono 2 la sera", () => {
    const seeded = resolveSeedRules(STANDARD_RULE_SET, departments)
      .filter((r) => r.name.startsWith("Sole"))
      .map((r) => ({ ...r, id: r.name }));
    const variables = Object.fromEntries(STANDARD_RULE_SET.variables.map((v) => [v.key, v.value]));
    // Una sola persona in Sole 10–20 (con un'altra solo fino alle 12): apertura ok, sera no.
    const shifts = [sh("sole1", MON, "10:00", "20:00"), sh("sole2", MON, "10:00", "12:00")];
    const v = evaluateRules(ctx(shifts, { variables }), seeded);
    expect(v.map((x) => [x.ruleName, x.start, x.end, x.actual, x.expected])).toEqual([
      ["Sole sera", "12:00", "13:00", 1, 2],
      ["Sole sera", "14:00", "20:00", 1, 2],
    ]);
    expect(v[0].message).toBe("Lun 21 · 12:00–13:00 · Sole: 1/2 · regola 'Sole sera'");
    // Con due persone la sera, nessun avviso; con una sola in apertura, nessun avviso.
    const ok = [sh("sole1", MON, "10:00", "20:00"), sh("sole2", MON, "12:00", "20:00")];
    expect(evaluateRules(ctx(ok, { variables }), seeded)).toEqual([]);
  });

  it("unisce le violazioni contigue con il valore minimo", () => {
    // 14–16: 1 persona; 16–17: 0; 17–18: 1 → una sola violazione 14:00–18:00, actual 0
    const shifts = [sh("sole1", MON, "10:00", "16:00"), sh("sole2", MON, "17:00", "20:00")];
    const r = soleMin(2, [{ start: "14:00", end: "18:00" }]);
    const v = evaluateRules(ctx(shifts), [r]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ start: "14:00", end: "18:00", actual: 0, expected: 2 });
  });

  it("non unisce fasce separate dalla 13–14 esclusa", () => {
    const r = soleMin(1, [
      { start: "12:00", end: "13:00" },
      { start: "14:00", end: "15:00" },
    ]);
    const v = evaluateRules(ctx([]), [r]);
    expect(v.map((x) => `${x.start}–${x.end}`)).toEqual(["12:00–13:00", "14:00–15:00"]);
  });

  it("le fasce sono intersecate con l'orario di apertura (eccezioni comprese)", () => {
    const r = soleMin(1, [{ start: "07:00", end: "22:00" }]);
    expect(evaluateRules(ctx([]), [r])[0]).toMatchObject({ start: "10:00", end: "20:00" });
    const short = ctx([], { openingExceptions: { [MON]: { start: "10:00", end: "14:00" } } });
    expect(evaluateRules(short, [r])[0]).toMatchObject({ start: "10:00", end: "14:00" });
    const closed = ctx([], { openingExceptions: { [MON]: null } });
    expect(evaluateRules(closed, [r])).toEqual([]);
  });

  it("senza fasce vale tutto l'orario di apertura", () => {
    const v = evaluateRules(ctx([sh("sole1", MON, "10:00", "19:00")]), [soleMin(1, [])]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ start: "19:00", end: "20:00", actual: 0 });
  });

  it("festività a negozio chiuso: nessuna violazione di presenza", () => {
    const v = evaluateRules(ctx([], { holidays: [{ date: MON, storeClosed: true }] }), [
      soleMin(1, []),
    ]);
    expect(v).toEqual([]);
    const open = evaluateRules(ctx([], { holidays: [{ date: MON, storeClosed: false }] }), [
      soleMin(1, []),
    ]);
    expect(open).toHaveLength(1);
  });

  it("giorni, periodo di validità e attiva", () => {
    const days2 = ctx([], { days: [MON, TUE] });
    expect(evaluateRules(days2, [soleMin(1, [])])).toHaveLength(2);
    expect(evaluateRules(days2, [{ ...soleMin(1, []), days: [2] }])[0].date).toBe(TUE);
    expect(evaluateRules(days2, [{ ...soleMin(1, []), validFrom: TUE }])[0].date).toBe(TUE);
    expect(evaluateRules(days2, [{ ...soleMin(1, []), validTo: MON }])[0].date).toBe(MON);
    expect(evaluateRules(days2, [{ ...soleMin(1, []), active: false }])).toEqual([]);
  });

  it("back office: conta solo con includeBackOffice", () => {
    const shifts = [sh("vista2", MON, "10:00", "20:00", { backOffice: true })];
    const base = { scope: { kind: "zone", zone: "vista" }, min: 1 };
    expect(evaluateRules(ctx(shifts), [rule("min_presence", base)])).toHaveLength(1);
    expect(
      evaluateRules(ctx(shifts), [rule("min_presence", { ...base, includeBackOffice: true })]),
    ).toEqual([]);
  });

  it("ambito reparto", () => {
    const shifts = [sh("vista1", MON, "10:00", "15:00"), sh("vista2", MON, "10:00", "20:00")];
    const r = rule("min_presence", { scope: { kind: "department", departmentId: "ott" }, min: 1 });
    expect(evaluateRules(ctx(shifts), [r])).toMatchObject([
      { start: "15:00", end: "20:00", actual: 0 },
    ]);
    expect(evaluateRules(ctx(shifts), [r])[0].message).toContain("Ottici: 0/1");
  });
});

describe("motore: robustezza, override, ordinamento", () => {
  it("parametri non validi o variabili mancanti non fanno crashare: avviso info", () => {
    const shifts = [sh("sole1", MON, "10:00", "20:00")];
    const rules = [
      rule(
        "min_presence",
        { scope: { kind: "zone", zone: "sole" }, min: "tanti" },
        { name: "Rotta" },
      ),
      rule("min_presence", null, { name: "Vuota" }),
      rule("non_esiste", {}, { name: "Ignota" }),
      soleMin({ var: "variabile_mancante" }, []),
      soleMin(2, [{ start: "18:00", end: "20:00" }]),
    ];
    const v = evaluateRules(ctx(shifts), rules);
    const info = v.filter((x) => x.severity === "info");
    expect(info).toHaveLength(4);
    expect(info.map((x) => x.message).join("\n")).toMatch(/'Rotta' non configurata correttamente/);
    expect(info.map((x) => x.message).join("\n")).toMatch(/variabile_mancante/);
    expect(info.map((x) => x.message).join("\n")).toMatch(/"non_esiste" sconosciuto/);
    // la regola valida viene comunque valutata
    expect(v.filter((x) => x.severity === "warning")).toHaveLength(1);
  });

  it("override: ignora la regola per quel giorno, oppure per tutta la settimana", () => {
    const c = ctx([], { days: [MON, TUE, WED] });
    const r = soleMin(1, []);
    expect(evaluateRules(c, [r])).toHaveLength(3);
    const v = evaluateRules(c, [r], { overrides: [{ ruleId: r.id, date: TUE }] });
    expect(v.map((x) => x.date)).toEqual([MON, WED]);
    expect(evaluateRules(c, [r], { overrides: [{ ruleId: r.id, date: null }] })).toEqual([]);
    expect(evaluateRules(c, [r], { overrides: [{ ruleId: "altra", date: TUE }] })).toHaveLength(3);
  });

  it("ordina per data e ora; le violazioni settimanali vanno in fondo", () => {
    const c = ctx([sh("sole1", TUE, "10:00", "12:00")], { days: [MON, TUE] });
    const v = evaluateRules(c, [
      rule("weekly_hours_deviation", { pct: 10 }),
      soleMin(1, [{ start: "14:00", end: "15:00" }]),
      soleMin(1, [{ start: "10:00", end: "11:00" }]),
    ]);
    const keys = v.map((x) => `${x.date ?? "settimana"} ${x.start ?? ""}`);
    expect(keys.slice(0, 3)).toEqual([`${MON} 10:00`, `${MON} 14:00`, `${TUE} 14:00`]);
    expect(keys.slice(3).every((k) => k.startsWith("settimana"))).toBe(true);
  });

  it("describeRule: frase leggibile, anche con variabili; regole rotte non crashano", () => {
    const dctx = { variables: { min_sole_apertura: 1 }, departments };
    const r = soleMin(1, [{ start: "10:00", end: "12:00" }]);
    expect(describeRule(r, dctx)).toBe("Sole: almeno 1 persona · lun–dom · 10:00–12:00");
    const withVar = soleMin({ var: "min_sole_apertura" }, [{ start: "10:00", end: "12:00" }]);
    expect(describeRule({ ...withVar, days: [1, 2, 3, 4, 5, 6] }, dctx)).toBe(
      "Sole: almeno 1 persona (min_sole_apertura) · lun–sab · 10:00–12:00",
    );
    expect(
      describeRule({ ...r, days: [6], validFrom: "2026-12-01", validTo: "2026-12-24" }, dctx),
    ).toBe("Sole: almeno 1 persona · sab · 10:00–12:00 · dal 01/12/2026 al 24/12/2026");
    expect(describeRule(rule("min_presence", { min: "x" }), dctx)).toMatch(/^Regola non valida/);
    expect(describeRule(rule("boh", {}), dctx)).toMatch(/sconosciuto/);
  });

  it("describeRule per ogni tipo con i parametri di default", () => {
    const dctx = { variables: {}, departments };
    for (const t of RULE_TYPES) {
      const text = describeRule(rule(t.type, t.definition.defaultParams), dctx);
      expect(text, t.type).not.toMatch(/non valida|undefined|NaN/);
    }
    expect(describeRule(rule("mandatory_break", { afterHours: 6, minMinutes: 30 }), dctx)).toBe(
      "Pausa di almeno 30 minuti dopo 6 ore di lavoro · lun–dom",
    );
    expect(
      describeRule(rule("weekly_hours_deviation", { pct: { var: "t" } }), {
        variables: { t: 10 },
        departments,
      }),
    ).toBe("Ore pianificate entro ±10% (t) delle ore di contratto");
  });
});

describe("max_presence", () => {
  it("massimo 1 in back office il sabato, anche prima dell'apertura", () => {
    const c = ctx(
      [
        sh("vista1", SAT, "08:30", "10:00", { backOffice: true }),
        sh("vista2", SAT, "09:00", "10:00", { backOffice: true }),
        sh("sole1", SAT, "09:00", "12:00"),
      ],
      { days: [SAT] },
    );
    const r = rule(
      "max_presence",
      { scope: { kind: "all" }, max: 1, backOfficeOnly: true },
      { days: [6] },
    );
    const v = evaluateRules(c, [r]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ start: "09:00", end: "10:00", actual: 2, expected: 1 });
    expect(v[0].message).toBe(`Sab 26 · 09:00–10:00 · Back office: 2/1 · regola '${r.name}'`);
  });

  it("massimo di forza vendita in un'area", () => {
    const c = ctx([sh("sole1", MON, "10:00", "12:00"), sh("sole2", MON, "11:00", "12:00")]);
    const r = rule("max_presence", { scope: { kind: "zone", zone: "sole" }, max: 1 });
    expect(evaluateRules(c, [r])).toMatchObject([{ start: "11:00", end: "12:00", actual: 2 }]);
  });
});

describe("opening_presence", () => {
  const r = () =>
    rule(
      "opening_presence",
      { minutesBeforeOpening: 90, min: 1, scope: { kind: "all" }, includeBackOffice: true },
      { days: [1, 2, 3, 4, 5, 6] },
    );

  it("almeno 1 persona dalle 08:30 (apertura alle 10)", () => {
    const ok = ctx([sh("vista1", MON, "08:30", "10:00", { backOffice: true })]);
    expect(evaluateRules(ok, [r()])).toEqual([]);
    const late = ctx([sh("vista1", MON, "09:00", "10:00", { backOffice: true })]);
    expect(evaluateRules(late, [r()])).toMatchObject([
      { start: "08:30", end: "09:00", actual: 0, expected: 1 },
    ]);
  });

  it("segue l'orario del giorno e salta la domenica e i giorni chiusi", () => {
    const sunday = ctx([], {
      days: [SUN],
      openingHours: { 7: { start: "10:30", end: "20:00" } },
    });
    expect(evaluateRules(sunday, [r()])).toEqual([]);
    const allDays = { ...r(), days: [] };
    expect(evaluateRules(sunday, [allDays])[0]).toMatchObject({ start: "09:00", end: "10:30" });
    const closed = ctx([], { holidays: [{ date: MON, storeClosed: true }] });
    expect(evaluateRules(closed, [r()])).toEqual([]);
  });
});

describe("max_on_leave", () => {
  const leaves: LeaveInput[] = [
    { profileId: "vista1", date: MON, type: "ferie", hours: null, status: "confirmed" },
    { profileId: "vista2", date: MON, type: "ferie", hours: null, status: "tentative" },
    { profileId: "sole1", date: MON, type: "malattia", hours: null, status: "confirmed" },
  ];

  it("conta le ferie, anche da confermare, nell'ambito", () => {
    const c = ctx([], { leaves });
    expect(
      evaluateRules(c, [rule("max_on_leave", { scope: { kind: "all" }, max: 1 })]),
    ).toMatchObject([{ date: MON, actual: 2, expected: 1 }]);
    expect(
      evaluateRules(c, [
        rule("max_on_leave", { scope: { kind: "all" }, max: 1, includeTentative: false }),
      ]),
    ).toEqual([]);
    expect(
      evaluateRules(c, [
        rule("max_on_leave", { scope: { kind: "department", departmentId: "ott" }, max: 0 }),
      ]),
    ).toMatchObject([{ actual: 1, expected: 0 }]);
    expect(
      evaluateRules(c, [
        rule("max_on_leave", {
          scope: { kind: "all" },
          max: 2,
          leaveTypes: ["ferie", "malattia"],
        }),
      ])[0].actual,
    ).toBe(3);
  });
});

describe("regole per persona", () => {
  it("weekly_hours_deviation: ±10%, ferie contate come ore coperte", () => {
    const shifts = [MON, TUE, WED].map((d) => sh("sole1", d, "10:00", "18:00"));
    const leaves: LeaveInput[] = [
      { profileId: "sole1", date: "2026-09-24", type: "ferie", hours: null, status: "confirmed" },
      { profileId: "sole1", date: "2026-09-25", type: "permesso", hours: 4, status: "confirmed" },
    ];
    const c = ctx(shifts, { days: WEEK, leaves, people: [people[0]] });
    // 24 h + 8 (ferie) + 4 (permesso) = 36 → dentro il 10% di 40
    expect(evaluateRules(c, [rule("weekly_hours_deviation", { pct: 10 })])).toEqual([]);
    const v = evaluateRules(c, [rule("weekly_hours_deviation", { pct: 5 })]);
    expect(v).toMatchObject([{ profileId: "sole1", actual: 36, expected: 40 }]);
    expect(v[0].message).toMatch(/^Sole1: 36 ore su 40 \(assenze comprese\), fuori dal ±5%/);
    expect(
      evaluateRules(c, [rule("weekly_hours_deviation", { pct: 10, countLeaves: false })]),
    ).toMatchObject([{ actual: 24 }]);
  });

  it("min_rest_between_shifts: anche tra la domenica precedente e il lunedì", () => {
    const c = ctx([sh("sole1", MON, "08:00", "12:00"), sh("sole1", TUE, "07:00", "12:00")], {
      days: [MON, TUE],
      previousWeekShifts: [sh("sole1", "2026-09-20", "14:00", "22:00")],
    });
    const v = evaluateRules(c, [rule("min_rest_between_shifts", { hours: 11 })]);
    expect(v).toMatchObject([
      { date: MON, profileId: "sole1", actual: 10, expected: 11 },
      // lunedì finisce alle 12, martedì inizia alle 7 → 19 ore: ok
    ]);
    expect(v[0].message).toBe(
      "Lun 21 · Sole1: riposo di 10 ore dal turno precedente (minimo 11) · regola '" +
        v[0].ruleName +
        "'",
    );
  });

  it("max_consecutive_days: conta la settimana precedente, una violazione per serie", () => {
    const prev = ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"].map((d) =>
      sh("sole1", d, "10:00", "14:00"),
    );
    const cur = [MON, TUE, WED, "2026-09-24"].map((d) => sh("sole1", d, "10:00", "14:00"));
    const c = ctx(cur, { days: WEEK, previousWeekShifts: prev });
    const v = evaluateRules(c, [rule("max_consecutive_days", { days: 6 })]);
    expect(v).toMatchObject([{ date: WED, actual: 7, expected: 6 }]);
    const noPrev = ctx(cur, { days: WEEK });
    expect(evaluateRules(noPrev, [rule("max_consecutive_days", { days: 6 })])).toEqual([]);
  });

  it("min_weekly_rest_days", () => {
    const all = WEEK.map((d) => sh("sole1", d, "10:00", "14:00"));
    const c = ctx(all, { days: WEEK });
    expect(evaluateRules(c, [rule("min_weekly_rest_days", { days: 1 })])).toMatchObject([
      { profileId: "sole1", actual: 0, expected: 1 },
    ]);
    const six = ctx(all.slice(0, 6), { days: WEEK });
    expect(evaluateRules(six, [rule("min_weekly_rest_days", { days: 1 })])).toEqual([]);
  });

  it("mandatory_break: pausa dichiarata o vuoti tra i pezzi del turno", () => {
    const r = rule("mandatory_break", { afterHours: 6, minMinutes: 30 });
    const run = (shifts: ShiftInput[]) => evaluateRules(ctx(shifts), [r]);
    // 10–17 senza pausa: 7 ore di fila
    expect(run([sh("sole1", MON, "10:00", "17:00")])).toMatchObject([
      { start: "10:00", end: "17:00", actual: 0, expected: 30 },
    ]);
    // con pausa dichiarata di 30'
    expect(run([sh("sole1", MON, "10:00", "17:00", { breakMinutes: 30 })])).toEqual([]);
    // spezzato con un vuoto di un'ora: due tratti brevi
    expect(run([sh("sole1", MON, "10:00", "13:00"), sh("sole1", MON, "14:00", "19:00")])).toEqual(
      [],
    );
    // vuoto di 15' + pausa di 15' sullo stesso tratto: 30' in tutto
    expect(
      run([
        sh("sole1", MON, "10:00", "13:00"),
        sh("sole1", MON, "13:15", "18:00", { breakMinutes: 15 }),
      ]),
    ).toEqual([]);
    // vuoto di 15' soltanto: tratto 10–18 con 15' di pausa
    expect(
      run([sh("sole1", MON, "10:00", "13:00"), sh("sole1", MON, "13:15", "18:00")]),
    ).toMatchObject([{ start: "10:00", end: "18:00", actual: 15 }]);
    // esattamente 6 ore: non oltre la soglia
    expect(run([sh("sole1", MON, "10:00", "16:00")])).toEqual([]);
    // back office contiguo alla vendita fa parte dello stesso tratto
    expect(
      run([
        sh("sole1", MON, "08:30", "10:00", { backOffice: true }),
        sh("sole1", MON, "10:00", "15:00"),
      ]),
    ).toHaveLength(1);
  });
});
