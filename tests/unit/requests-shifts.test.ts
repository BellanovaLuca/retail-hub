import { describe, expect, it } from "vitest";
import { requestShiftDays, resolveShiftRequest, type PublishedShiftRef } from "@/lib/requests";

const ME = "io";
const COLLEGA = "collega";
const TERZO = "terzo";

const shift = (
  id: string,
  profileId: string,
  date: string,
  extra: Partial<PublishedShiftRef> = {},
): PublishedShiftRef => ({ id, profileId, date, startTime: "10:00", isAbsence: false, ...extra });

const mioSabato = shift("s1", ME, "2026-12-05");
const suoMartedi = shift("s2", COLLEGA, "2026-12-08");

describe("giorni di cambio e scambio ricavati dai turni pubblicati", () => {
  it("cambio turno: il giorno è quello del mio turno", () => {
    expect(
      resolveShiftRequest({
        type: "cambio_turno",
        me: ME,
        shiftId: "s1",
        targetProfileId: null,
        targetShiftId: null,
        shifts: [mioSabato],
      }),
    ).toEqual({ ok: true, startDate: "2026-12-05", targetDate: null });
  });

  it("scambio: giorno mio e giorno del collega, qualunque data mandi il browser", () => {
    expect(
      resolveShiftRequest({
        type: "scambio_turno",
        me: ME,
        shiftId: "s1",
        targetProfileId: COLLEGA,
        targetShiftId: "s2",
        shifts: [suoMartedi, mioSabato],
      }),
    ).toEqual({ ok: true, startDate: "2026-12-05", targetDate: "2026-12-08" });
  });

  it("scambio senza turno in cambio: il collega prende solo il mio", () => {
    expect(
      resolveShiftRequest({
        type: "scambio_turno",
        me: ME,
        shiftId: "s1",
        targetProfileId: COLLEGA,
        targetShiftId: null,
        shifts: [mioSabato],
      }),
    ).toEqual({ ok: true, startDate: "2026-12-05", targetDate: null });
  });

  it("rifiuta un turno che non è mio", () => {
    const r = resolveShiftRequest({
      type: "scambio_turno",
      me: ME,
      shiftId: "s2",
      targetProfileId: COLLEGA,
      targetShiftId: null,
      shifts: [suoMartedi],
    });
    expect(r).toMatchObject({ ok: false, field: "shiftId" });
  });

  it("rifiuta un turno in cambio che è di un terzo, non del collega scelto", () => {
    const r = resolveShiftRequest({
      type: "scambio_turno",
      me: ME,
      shiftId: "s1",
      targetProfileId: COLLEGA,
      targetShiftId: "s3",
      shifts: [mioSabato, shift("s3", TERZO, "2026-12-09")],
    });
    expect(r).toMatchObject({ ok: false, field: "targetShiftId" });
  });

  it("rifiuta assenze e turni non più pubblicati, con un messaggio che dice di ricaricare", () => {
    const base = {
      type: "scambio_turno" as const,
      me: ME,
      targetProfileId: COLLEGA,
    };
    expect(
      resolveShiftRequest({
        ...base,
        shiftId: "s1",
        targetShiftId: null,
        shifts: [shift("s1", ME, "2026-12-05", { isAbsence: true, startTime: null })],
      }),
    ).toMatchObject({ ok: false, field: "shiftId" });
    const gone = resolveShiftRequest({ ...base, shiftId: "s1", targetShiftId: null, shifts: [] });
    expect(gone).toMatchObject({ ok: false, field: "shiftId" });
    expect(gone.ok ? "" : gone.message).toMatch(/ricarica la pagina/);
    expect(
      resolveShiftRequest({ ...base, shiftId: "s1", targetShiftId: "s9", shifts: [mioSabato] }),
    ).toMatchObject({ ok: false, field: "targetShiftId" });
    expect(
      resolveShiftRequest({
        ...base,
        shiftId: "s1",
        targetShiftId: "s2",
        shifts: [mioSabato, { ...suoMartedi, isAbsence: true }],
      }),
    ).toMatchObject({ ok: false, field: "targetShiftId" });
  });

  it("senza turno scelto chiede di sceglierlo", () => {
    expect(
      resolveShiftRequest({
        type: "cambio_turno",
        me: ME,
        shiftId: null,
        targetProfileId: null,
        targetShiftId: null,
        shifts: [],
      }),
    ).toEqual({ ok: false, field: "shiftId", message: "Scegli un tuo turno." });
  });
});

describe("turni da mostrare nel dettaglio (persona + giorno)", () => {
  const swap = {
    type: "scambio_turno",
    status: "pending",
    profile_id: ME,
    target_profile_id: COLLEGA,
    start_date: "2026-12-05",
    target_date: "2026-12-08",
  };

  it("scambio in attesa: il mio giorno è mio, quello in cambio è del collega", () => {
    expect(requestShiftDays(swap)).toEqual({
      shift: { profileId: ME, date: "2026-12-05" },
      targetShift: { profileId: COLLEGA, date: "2026-12-08" },
    });
    expect(requestShiftDays({ ...swap, status: "peer_accepted" }).shift?.profileId).toBe(ME);
  });

  it("scambio approvato: i turni sono passati di mano", () => {
    expect(requestShiftDays({ ...swap, status: "approved" })).toEqual({
      shift: { profileId: COLLEGA, date: "2026-12-05" },
      targetShift: { profileId: ME, date: "2026-12-08" },
    });
  });

  it("scambio senza turno in cambio, o con il collega eliminato", () => {
    expect(requestShiftDays({ ...swap, target_date: null }).targetShift).toBeNull();
    expect(
      requestShiftDays({ ...swap, status: "approved", target_profile_id: null }),
    ).toEqual({ shift: { profileId: ME, date: "2026-12-05" }, targetShift: null });
  });

  it("cambio turno: il giorno di chi chiede; gli altri tipi non hanno turni", () => {
    expect(requestShiftDays({ ...swap, type: "cambio_turno", target_profile_id: null })).toEqual({
      shift: { profileId: ME, date: "2026-12-05" },
      targetShift: null,
    });
    expect(requestShiftDays({ ...swap, type: "ferie" })).toEqual({
      shift: null,
      targetShift: null,
    });
  });
});
