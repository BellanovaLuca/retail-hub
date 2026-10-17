/**
 * Fixture "Week 39" (§7.3, §16): TESTE, DELTA, Vista, Sole, COP. OTT., righe ORARIO e TOT,
 * ore di contratto e violazioni del set di regole "Standard".
 */
import { describe, expect, it } from "vitest";
import { computeCoverage, dailyTotals, personHourCells } from "@/lib/coverage";
import { weekdayOf } from "@/lib/domain/time";
import { weekNumber } from "@/lib/dates";
import { personWeekHours, residualHoursByDay, totalContractHours } from "@/lib/hours";
import { describeRule, evaluateRules } from "@/lib/rules/registry";
import type { RuleRecord } from "@/lib/rules/types";
import {
  DEPARTMENTS,
  FRI,
  MON,
  PEOPLE,
  SAT,
  SHIFTS,
  STANDARD_RULES,
  STANDARD_VARIABLES,
  SUN,
  THU,
  TUE,
  WED,
  WEEK39_DAYS,
  week39Context,
} from "@/tests/fixtures/week39";

const coverage = (date: string) =>
  computeCoverage({ date, shifts: SHIFTS, people: PEOPLE, departments: DEPARTMENTS });
const slot = (date: string, start: string) => coverage(date).find((s) => s.start === start)!;

describe("Week 39 · la settimana", () => {
  it("è la settimana 39, da lunedì 21 a domenica 27 settembre 2026", () => {
    expect(WEEK39_DAYS[0]).toBe("2026-09-21");
    expect(WEEK39_DAYS[6]).toBe("2026-09-27");
    expect(WEEK39_DAYS.map(weekdayOf)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weekNumber(new Date(2026, 8, 21))).toBe(39);
  });

  it("20 persone, tre Francesca con nomi visualizzati diversi", () => {
    expect(PEOPLE).toHaveLength(20);
    const names = PEOPLE.map((p) => p.displayName);
    expect(new Set(names).size).toBe(20);
    expect(names.filter((n) => /^fra/i.test(n))).toEqual(["Francesca", "Francy", "Fra D."]);
  });

  it("totale ore di contratto nell'intestazione", () => {
    expect(totalContractHours(PEOPLE)).toBe(672);
  });
});

describe("Week 39 · TESTE, DELTA, Vista, Sole, COP. OTT.", () => {
  it("lunedì 08:30: Paola in back office → TESTE 1, DELTA 0 (= TESTE − 1)", () => {
    for (const t of ["08:30", "09:00", "09:30"]) {
      expect(slot(MON, t)).toMatchObject({ teste: 1, delta: 0, vista: 0, sole: 0, backOffice: 1 });
    }
    expect(slot(MON, "08:00")).toMatchObject({ teste: 0, delta: 0 });
  });

  it("lunedì 10:00: Paola passa in vendita e conta", () => {
    expect(slot(MON, "10:00")).toMatchObject({
      teste: 7,
      delta: 7,
      vista: 5,
      sole: 2,
      ottici: 2,
      copOtt: true,
    });
  });

  it("lunedì 11:00–13:00 e pausa 13–14", () => {
    expect(slot(MON, "11:00")).toMatchObject({
      teste: 10,
      delta: 10,
      vista: 7,
      sole: 3,
      ottici: 3,
    });
    // 13–14: restano solo i manager (pausa di 60' senza posizione)
    expect(slot(MON, "13:00")).toMatchObject({ teste: 2, delta: 2, vista: 1, sole: 1, ottici: 1 });
  });

  it("lunedì pomeriggio e chiusura", () => {
    expect(slot(MON, "14:00")).toMatchObject({ teste: 14, vista: 8, sole: 6, ottici: 4 });
    expect(slot(MON, "19:30")).toMatchObject({
      teste: 10,
      delta: 10,
      vista: 5,
      sole: 5,
      ottici: 3,
    });
    expect(slot(MON, "20:00")).toMatchObject({ teste: 0 });
  });

  it("DELTA = TESTE − persone in back office, in ogni fascia della settimana", () => {
    for (const d of WEEK39_DAYS) {
      for (const s of coverage(d)) {
        expect(s.delta).toBe(s.teste - s.backOffice);
        expect(s.vista + s.sole).toBe(s.delta); // tutti i turni di vendita hanno un'area
      }
    }
  });

  it("sabato apre il back office Elena (Sole), poi passa in vendita in Sole", () => {
    expect(slot(SAT, "08:30")).toMatchObject({ teste: 1, delta: 0 });
    expect(slot(SAT, "10:00")).toMatchObject({ sole: 2 }); // Elena + Irene
  });

  it("i jolly seguono l'area del turno: Alessio lun Vista, mar Sole", () => {
    const at = (date: string) =>
      computeCoverage({
        date,
        shifts: SHIFTS.filter((s) => s.profileId === "alessio"),
        people: PEOPLE,
        departments: DEPARTMENTS,
      }).find((s) => s.start === "15:00")!;
    expect(at(MON)).toMatchObject({ vista: 1, sole: 0 });
    expect(at(TUE)).toMatchObject({ vista: 0, sole: 1 });
  });

  it("mercoledì 19–20 nessun ottico; giovedì 19–20 una sola persona in Sole", () => {
    expect(slot(WED, "18:30")).toMatchObject({ copOtt: true });
    expect(slot(WED, "19:00")).toMatchObject({ ottici: 0, copOtt: false });
    expect(slot(WED, "19:30")).toMatchObject({ ottici: 0, copOtt: false });
    expect(slot(THU, "18:30").sole).toBe(3);
    expect(slot(THU, "19:00").sole).toBe(1);
  });

  it("domenica apre alle 10:30", () => {
    expect(slot(SUN, "10:00").teste).toBe(0);
    expect(slot(SUN, "10:30")).toMatchObject({ teste: 3, vista: 1, sole: 2, ottici: 1 });
  });
});

describe("Week 39 · righe TOT e ORARIO", () => {
  it("TOT: ore del giorno del negozio", () => {
    expect(WEEK39_DAYS.map((d) => dailyTotals(d, SHIFTS).total)).toEqual([
      110, 102, 83, 95, 95, 110, 68,
    ]);
  });

  it("TOT: ore del giorno per persona", () => {
    const mon = dailyTotals(MON, SHIFTS).byPerson;
    expect(mon).toMatchObject({ marco: 9, paola: 8, francesca: 8, sara: 6, chiara: 4 });
    expect(mon.giorgio).toBeUndefined(); // riposo
    expect(dailyTotals(WED, SHIFTS).byPerson.luca).toBeUndefined(); // ferie
  });

  it("celle ORA di Paola il lunedì: 0,5 alle 8, poi 1, vuota alle 13", () => {
    const cells = personHourCells(SHIFTS, "paola", MON);
    const v = (h: number) => cells.find((c) => c.hour === h)!.value;
    expect([v(7), v(8), v(9), v(10), v(13), v(17), v(18)]).toEqual([0, 0.5, 1, 1, 0, 0.5, 0]);
    expect(cells.reduce((s, c) => s + c.value, 0)).toBe(8);
  });

  it("ORARIO: residuo in testa a ogni giorno (40 → 32 → 24…)", () => {
    const residual = (id: string) => {
      const p = PEOPLE.find((x) => x.id === id)!;
      return residualHoursByDay(
        p.weeklyHours,
        SHIFTS.filter((s) => s.profileId === id),
        WEEK39_DAYS,
      ).map((r) => r.before);
    };
    expect(residual("paola")).toEqual([40, 32, 24, 16, 8, 0, 0]);
    expect(residual("marco")).toEqual([40, 31, 22, 22, 13, 4, 0]);
    expect(residual("luca")).toEqual([40, 32, 24, 24, 16, 8, 8]); // ferie mercoledì
    expect(residual("elena")).toEqual([40, 31, 22, 13, 13, 9, 1]);
  });

  it("ore pianificate della settimana per persona", () => {
    expect(personWeekHours(SHIFTS, "francesca")).toBe(40);
    expect(personWeekHours(SHIFTS, "valentina")).toBe(30);
    expect(personWeekHours(SHIFTS, "roberto")).toBe(24);
    expect(PEOPLE.reduce((s, p) => s + personWeekHours(SHIFTS, p.id), 0)).toBe(663);
  });
});

describe("Week 39 · regole Standard", () => {
  it("segnalano esattamente il buco di ottici di mercoledì sera e di Sole di giovedì sera", () => {
    const v = evaluateRules(week39Context(), STANDARD_RULES);
    expect(v.map((x) => x.message)).toEqual([
      "Mer 23 · 19:00–20:00 · Ottici: 0/1 · regola 'COP. OTT.'",
      "Gio 24 · 19:00–20:00 · Sole: 1/2 · regola 'Sole sera'",
    ]);
    expect(v[0]).toMatchObject({
      ruleId: "COP. OTT.",
      ruleType: "min_presence",
      severity: "warning",
      date: WED,
      start: "19:00",
      end: "20:00",
      actual: 0,
      expected: 1,
    });
  });

  it("le frasi leggibili del set Standard", () => {
    const dctx = { variables: STANDARD_VARIABLES, departments: DEPARTMENTS };
    const text = Object.fromEntries(STANDARD_RULES.map((r) => [r.name, describeRule(r, dctx)]));
    expect(text["Sole apertura"]).toBe(
      "Sole: almeno 1 persona (min_sole_apertura) · lun–dom · 10:00–12:00",
    );
    expect(text["Sole sera"]).toBe(
      "Sole: almeno 2 persone (min_sole_sera) · lun–dom · 12:00–13:00, 14:00–22:00",
    );
    expect(text["Apertura back office"]).toBe(
      "Almeno 1 persona (min_backoffice_apertura) da 90 minuti prima dell'apertura · lun–sab",
    );
    expect(text["Ore di contratto"]).toBe(
      "Ore pianificate entro ±10% (tolleranza_ore) delle ore di contratto",
    );
  });

  it("override: ignorare COP. OTT. di mercoledì lascia solo l'avviso di Sole", () => {
    const v = evaluateRules(week39Context(), STANDARD_RULES, {
      overrides: [{ ruleId: "COP. OTT.", date: WED }],
    });
    expect(v.map((x) => x.ruleName)).toEqual(["Sole sera"]);
  });

  it("festività a negozio chiuso mercoledì: sparisce l'avviso di quel giorno", () => {
    const v = evaluateRules(
      week39Context({ holidays: [{ date: WED, storeClosed: true }] }),
      STANDARD_RULES,
    );
    expect(v.map((x) => x.date)).toEqual([THU]);
  });

  it("nuova regola 'Sabato Vista ≥ 3' tramite variabile: cambiare la variabile cambia gli avvisi", () => {
    const sabatoVista: RuleRecord = {
      id: "sabato-vista",
      name: "Sabato Vista",
      type: "min_presence",
      params: { scope: { kind: "zone", zone: "vista" }, min: { var: "min_vista_sabato" } },
      days: [6],
      timeWindows: [
        { start: "11:00", end: "13:00" },
        { start: "14:00", end: "19:00" },
      ],
      validFrom: null,
      validTo: null,
      severity: "warning",
      active: true,
    };
    const rules = [...STANDARD_RULES, sabatoVista];
    const withVar = (n: number) =>
      evaluateRules(
        week39Context({ variables: { ...STANDARD_VARIABLES, min_vista_sabato: n } }),
        rules,
      ).filter((v) => v.ruleId === "sabato-vista");

    // Sabato in Vista: 4 persone 11–13, almeno 7 dalle 14 alle 19
    expect(withVar(3)).toEqual([]);
    expect(withVar(5).map((v) => v.message)).toEqual([
      "Sab 26 · 11:00–13:00 · Vista: 4/5 · regola 'Sabato Vista'",
    ]);
    expect(withVar(8).map((v) => `${v.start}–${v.end} ${v.actual}`)).toEqual([
      "11:00–13:00 4",
      "14:00–16:00 7",
    ]);
    // senza la variabile la regola è segnalata come mal configurata, le altre funzionano
    const missing = evaluateRules(week39Context(), rules);
    expect(missing.filter((v) => v.severity === "info").map((v) => v.ruleName)).toEqual([
      "Sabato Vista",
    ]);
    expect(missing.filter((v) => v.severity === "warning")).toHaveLength(2);
  });

  it("alzare min_sole_sera a 3 fa emergere più fasce, unite per giorno", () => {
    const v = evaluateRules(
      week39Context({ variables: { ...STANDARD_VARIABLES, min_sole_sera: 3 } }),
      STANDARD_RULES,
    ).filter((x) => x.ruleName === "Sole sera");
    expect(v.length).toBeGreaterThan(1);
    // nessuna coppia di violazioni contigue nello stesso giorno: sono state unite
    for (let i = 1; i < v.length; i++) {
      if (v[i].date === v[i - 1].date) expect(v[i].start).not.toBe(v[i - 1].end);
    }
  });

  it("il venerdì è tutto coperto", () => {
    const v = evaluateRules(week39Context(), STANDARD_RULES);
    expect(v.filter((x) => x.date === FRI)).toEqual([]);
  });
});
