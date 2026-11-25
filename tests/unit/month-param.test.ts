import { describe, expect, it } from "vitest";
import { parseMonthParam } from "@/app/(app)/orari/month-param";

describe("parametro mese di /orari", () => {
  it("mese valido → primo giorno del mese", () => {
    expect(parseMonthParam("2026-11")).toBe("2026-11-01");
    expect(parseMonthParam("2027-01")).toBe("2027-01-01");
    expect(parseMonthParam("2026-12")).toBe("2026-12-01");
  });
  it("mese o anno impossibili → null (la pagina usa il mese corrente)", () => {
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("2026-00")).toBeNull();
    expect(parseMonthParam("0000-05")).toBeNull();
    expect(parseMonthParam("9999-05")).toBeNull();
  });
  it("formato sbagliato o assente → null", () => {
    expect(parseMonthParam(undefined)).toBeNull();
    expect(parseMonthParam("")).toBeNull();
    expect(parseMonthParam("2026-1")).toBeNull();
    expect(parseMonthParam("2026-11-01")).toBeNull();
    expect(parseMonthParam("novembre")).toBeNull();
  });
});
