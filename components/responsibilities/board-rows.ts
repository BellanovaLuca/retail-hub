import type { Board } from "@/lib/data/responsibilities";
import { dutyLabel } from "@/lib/responsibilities/assignment";
import type { BoardCheck, BoardRow } from "./board";

/** Dati serializzabili per il tabellone (componente client). */
export function boardProps(board: Board, filterPersonId?: string | null) {
  const names = new Map(board.people.map((p) => [p.id, p.displayName]));
  const name = (id: string) => names.get(id) ?? "—";
  const items = filterPersonId
    ? board.items.filter(
        (r) => r.ownerId === filterPersonId || r.supportIds.includes(filterPersonId),
      )
    : board.items;
  const rows: BoardRow[] = items.map((r) => {
    const duty = board.todayDuty?.[r.id];
    return {
      id: r.id,
      title: r.title,
      allStaff: r.allStaff,
      scheduleDays: r.scheduleDays,
      owner: r.owner ? { id: r.owner.id, name: r.owner.name } : null,
      supports: r.supports.map((s) => ({ id: s.id, name: s.name })),
      todayLabel:
        duty?.kind === "uncovered" && !r.ownerId && r.supportIds.length === 0
          ? "nessuno assegnato"
          : duty
            ? dutyLabel(duty, name)
            : null,
      todayUncovered: duty?.kind === "uncovered",
    };
  });
  const checks: Record<string, Record<string, BoardCheck>> = {};
  for (const [id, byDate] of Object.entries(board.checks)) {
    checks[id] = {};
    for (const [date, c] of Object.entries(byDate)) {
      checks[id][date] = { doneByName: c.doneByName, doneAt: c.doneAt };
    }
  }
  return { rows, checks, days: board.days, today: board.today };
}
