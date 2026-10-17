/** Stato iniziale del foglio ferie dai parametri dell'URL (vista, periodo, mese, reparto). */
export type PlannerParams = {
  view: "persone" | "calendario";
  period: "mese" | "anno";
  month: number;
  department: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePlannerParams(
  sp: Record<string, string | string[] | undefined>,
  opts: { year: number; today: string },
): PlannerParams {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const month = Number(one("mese"));
  const currentMonth = opts.today.startsWith(`${opts.year}-`) ? Number(opts.today.slice(5, 7)) : 1;
  const department = one("reparto") ?? "";
  return {
    view: one("vista") === "calendario" ? "calendario" : "persone",
    period: one("periodo") === "anno" ? "anno" : "mese",
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : currentMonth,
    department: UUID.test(department) ? department : "",
  };
}
