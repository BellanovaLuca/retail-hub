import { describe, expect, it } from "vitest";
import {
  createsLeaves,
  DELETABLE_STATUSES,
  deleteGroupStatuses,
  isDeletable,
  type RequestStatus,
} from "@/lib/requests";
import {
  calendarTone,
  monthGridDays,
  monthLabel,
  parseCalendarMonth,
  requestDays,
  requestsByDay,
  shiftMonth,
  visibleCount,
  type CalendarRequest,
} from "@/lib/requests/calendar";

const req = (patch: Partial<CalendarRequest> & { id: string }): CalendarRequest => ({
  type: "ferie",
  status: "approved",
  start_date: "2026-12-01",
  end_date: "2026-12-01",
  recurring_weekdays: null,
  target_date: null,
  ...patch,
});

describe("calendario delle richieste: mese", () => {
  it("parametro mese valido o no", () => {
    expect(parseCalendarMonth("2026-12")).toBe("2026-12");
    expect(parseCalendarMonth("2026-13")).toBeNull();
    expect(parseCalendarMonth("2026-1")).toBeNull();
    expect(parseCalendarMonth("1999-05")).toBeNull();
    expect(parseCalendarMonth("2026-12-01")).toBeNull();
    expect(parseCalendarMonth("dicembre")).toBeNull();
    expect(parseCalendarMonth(undefined)).toBeNull();
  });

  it("mese precedente e successivo, anche a cavallo d'anno", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-03", -1)).toBe("2026-02");
  });

  it("etichetta in italiano", () => {
    expect(monthLabel("2026-12")).toBe("Dicembre 2026");
    expect(monthLabel("2027-01")).toBe("Gennaio 2027");
  });

  it("griglia a settimane intere lun→dom", () => {
    // Dicembre 2026: l'1 è martedì, il 31 giovedì → da lun 30 nov a dom 3 gen (5 settimane).
    const dec = monthGridDays("2026-12");
    expect(dec).toHaveLength(35);
    expect(dec[0]).toBe("2026-11-30");
    expect(dec[dec.length - 1]).toBe("2027-01-03");
    // Febbraio 2027: l'1 è lunedì e il 28 domenica → 4 settimane esatte.
    const feb = monthGridDays("2027-02");
    expect(feb).toHaveLength(28);
    expect(feb[0]).toBe("2027-02-01");
    expect(feb[27]).toBe("2027-02-28");
    // Agosto 2026: l'1 è sabato, il 31 lunedì → 6 settimane.
    const aug = monthGridDays("2026-08");
    expect(aug).toHaveLength(42);
    expect(aug[0]).toBe("2026-07-27");
    expect(aug[41]).toBe("2026-09-06");
    // Marzo e ottobre (cambio dell'ora): nessun giorno saltato o ripetuto.
    for (const m of ["2026-03", "2026-10", "2027-03"]) {
      const days = monthGridDays(m);
      expect(new Set(days).size).toBe(days.length);
      expect(days.length % 7).toBe(0);
    }
  });
});

describe("calendario delle richieste: giorni coperti", () => {
  const from = "2026-11-30";
  const to = "2027-01-03";

  it("periodo: ogni giorno da inizio a fine, tagliato sull'intervallo", () => {
    expect(
      requestDays(req({ id: "a", start_date: "2026-12-14", end_date: "2026-12-16" }), from, to),
    ).toEqual(["2026-12-14", "2026-12-15", "2026-12-16"]);
    // Inizia a novembre e finisce il 2 dicembre: solo i giorni dentro la griglia.
    expect(
      requestDays(req({ id: "b", start_date: "2026-11-25", end_date: "2026-12-02" }), from, to),
    ).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    // Tutta fuori.
    expect(
      requestDays(req({ id: "c", start_date: "2026-10-01", end_date: "2026-10-05" }), from, to),
    ).toEqual([]);
  });

  it("indisponibilità ricorrente: solo i giorni della settimana indicati", () => {
    const r = req({
      id: "r",
      type: "indisponibilita",
      start_date: "2026-12-01",
      end_date: "2026-12-31",
      recurring_weekdays: [1, 3], // lunedì e mercoledì
    });
    expect(requestDays(r, from, to)).toEqual([
      "2026-12-02",
      "2026-12-07",
      "2026-12-09",
      "2026-12-14",
      "2026-12-16",
      "2026-12-21",
      "2026-12-23",
      "2026-12-28",
      "2026-12-30",
    ]);
    // Elenco vuoto = nessun filtro (come nel trigger del database).
    expect(
      requestDays(
        req({ id: "e", start_date: "2026-12-01", end_date: "2026-12-02", recurring_weekdays: [] }),
        from,
        to,
      ),
    ).toEqual(["2026-12-01", "2026-12-02"]);
  });

  it("scambio: il giorno del turno ceduto e quello del turno preso in cambio", () => {
    const swap = req({
      id: "s",
      type: "scambio_turno",
      status: "peer_accepted",
      start_date: "2026-12-10",
      end_date: "2026-12-10",
      target_date: "2026-12-12",
    });
    expect(requestDays(swap, from, to)).toEqual(["2026-12-10", "2026-12-12"]);
    // Stesso giorno: una volta sola. Senza turno in cambio: solo il giorno ceduto.
    expect(requestDays({ ...swap, target_date: "2026-12-10" }, from, to)).toEqual(["2026-12-10"]);
    expect(requestDays({ ...swap, target_date: null }, from, to)).toEqual(["2026-12-10"]);
    // Il turno in cambio è nel mese, quello ceduto no: compare comunque.
    expect(
      requestDays({ ...swap, start_date: "2026-11-20", end_date: "2026-11-20" }, from, to),
    ).toEqual(["2026-12-12"]);
  });

  it("per giorno: tutte le richieste, prima in attesa, poi approvate, poi chiuse", () => {
    const days = monthGridDays("2026-12");
    const list = [
      req({ id: "anna-ok", start_date: "2026-12-14", end_date: "2026-12-15" }),
      req({ id: "bea-no", status: "rejected", start_date: "2026-12-14", end_date: "2026-12-14" }),
      req({ id: "carlo-wait", status: "pending", start_date: "2026-12-13", end_date: "2026-12-14" }),
      req({ id: "dario-ann", status: "cancelled", start_date: "2026-12-14", end_date: "2026-12-14" }),
      req({ id: "elsa-ok", start_date: "2026-12-14", end_date: "2026-12-14" }),
    ];
    const byDay = requestsByDay(list, days);
    expect(byDay.size).toBe(days.length);
    expect(byDay.get("2026-12-14")!.map((r) => r.id)).toEqual([
      "carlo-wait",
      "anna-ok",
      "elsa-ok",
      "bea-no",
      "dario-ann",
    ]);
    expect(byDay.get("2026-12-13")!.map((r) => r.id)).toEqual(["carlo-wait"]);
    expect(byDay.get("2026-12-15")!.map((r) => r.id)).toEqual(["anna-ok"]);
    expect(byDay.get("2026-12-16")).toEqual([]);
    expect(requestsByDay(list, []).size).toBe(0);
  });

  it("stato → disegno", () => {
    const tones: Record<RequestStatus, string> = {
      pending: "pending",
      peer_accepted: "pending",
      approved: "approved",
      rejected: "closed",
      peer_declined: "closed",
      cancelled: "closed",
    };
    for (const [status, tone] of Object.entries(tones)) expect(calendarTone(status)).toBe(tone);
  });

  it("tante richieste nello stesso giorno: prime 3 e «+N altre»", () => {
    expect(visibleCount(0)).toEqual({ shown: 0, hidden: 0 });
    expect(visibleCount(4)).toEqual({ shown: 4, hidden: 0 });
    expect(visibleCount(5)).toEqual({ shown: 3, hidden: 2 });
    expect(visibleCount(12)).toEqual({ shown: 3, hidden: 9 });
  });
});

describe("eliminazione delle richieste già decise", () => {
  it("si eliminano solo quelle decise o annullate, mai quelle in attesa", () => {
    expect([...DELETABLE_STATUSES].sort()).toEqual(
      ["approved", "cancelled", "peer_declined", "rejected"].sort(),
    );
    expect(isDeletable("approved")).toBe(true);
    expect(isDeletable("rejected")).toBe(true);
    expect(isDeletable("peer_declined")).toBe(true);
    expect(isDeletable("cancelled")).toBe(true);
    expect(isDeletable("pending")).toBe(false);
    expect(isDeletable("peer_accepted")).toBe(false);
  });

  it("«Elimina tutte le approvate / rifiutate»: stati compresi", () => {
    expect(deleteGroupStatuses("approved")).toEqual(["approved"]);
    // L'opzione «anche le annullate» vale solo per le rifiutate.
    expect(deleteGroupStatuses("approved", true)).toEqual(["approved"]);
    expect(deleteGroupStatuses("rejected")).toEqual(["rejected", "peer_declined"]);
    expect(deleteGroupStatuses("rejected", true)).toEqual([
      "rejected",
      "peer_declined",
      "cancelled",
    ]);
    for (const s of [...deleteGroupStatuses("approved"), ...deleteGroupStatuses("rejected", true)])
      expect(isDeletable(s)).toBe(true);
  });

  it("tipi che creano assenze (revocabili dal foglio turni)", () => {
    for (const t of ["ferie", "permesso", "malattia", "giorno_libero", "indisponibilita"])
      expect(createsLeaves(t)).toBe(true);
    for (const t of ["scambio_turno", "cambio_turno", "altro"]) expect(createsLeaves(t)).toBe(false);
  });
});
