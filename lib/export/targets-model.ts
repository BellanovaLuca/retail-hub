/**
 * Modello dell'export Excel degli obiettivi individuali (§8.3), nello stesso layout del file
 * "OBIETTIVI INDIVIDUALI": un foglio per gruppo di persone (Vista, Sole) e, per ogni persona,
 * il blocco voci × lun–dom, A quanto sei, Quanto mi manca, Obiettivo, Commento week.
 */
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { weekNumber } from "@/lib/dates";
import { buildPersonSheet, weekDates, type EntryValue, type SheetKpi } from "@/lib/kpi/sheet";
import type { TargetZone } from "@/lib/targets";

export type TargetsExportPerson = {
  profileId: string;
  name: string;
  zone: TargetZone;
  kpis: SheetKpi[];
};

export type TargetsExportRow = {
  label: string;
  days: (number | null)[];
  done: number;
  /** null = senza obiettivo; 0 = obiettivo raggiunto. */
  remaining: number | null;
  target: number | null;
  comment: string;
};

export type TargetsExportBlock = {
  name: string;
  rows: TargetsExportRow[];
  generalComment: string;
  note: string;
};

export type TargetsExportSheet = {
  name: string;
  zone: "vista" | "sole";
  blocks: TargetsExportBlock[];
};

export type TargetsExportModel = {
  title: string;
  weekNumber: number;
  dayHeaders: string[];
  sheets: TargetsExportSheet[];
};

export const EXPORT_COLUMNS = ["A quanto sei", "Quanto mi manca?", "Obiettivo", "Commento week"];

export function buildTargetsExportModel(input: {
  weekStart: string;
  people: TargetsExportPerson[];
  entries: EntryValue[];
  /** profileId → kpiId → obiettivo. */
  targets: Record<string, Record<string, number>>;
  /** profileId → kpiId (o "general") → commento. */
  comments: Record<string, Record<string, string>>;
  notes: Record<string, string>;
}): TargetsExportModel {
  const days = weekDates(input.weekStart);
  const number = weekNumber(parseISO(input.weekStart));
  const sheets = (["vista", "sole"] as const).map((zone): TargetsExportSheet => {
    const people = input.people.filter((p) => (p.zone === "sole" ? "sole" : "vista") === zone);
    return {
      name: zone === "vista" ? "Vista" : "Sole",
      zone,
      blocks: people.map((p) => {
        const comments = input.comments[p.profileId] ?? {};
        const rows = buildPersonSheet({
          days,
          kpis: p.kpis,
          entries: input.entries.filter((e) => e.profileId === p.profileId),
          targets: input.targets[p.profileId] ?? {},
          comments,
        });
        return {
          name: p.name,
          rows: rows.map((r) => ({
            label: r.label,
            days: days.map((d) => r.values[d]),
            done: r.done,
            remaining: r.remaining,
            target: r.target,
            comment: r.comment,
          })),
          generalComment: comments.general ?? "",
          note: input.notes[p.profileId] ?? "",
        };
      }),
    };
  });
  return {
    title: `Obiettivi individuali · Week ${number}`,
    weekNumber: number,
    dayHeaders: days.map((d) => {
      const label = format(parseISO(d), "EEE d/M", { locale: it });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }),
    sheets,
  };
}
