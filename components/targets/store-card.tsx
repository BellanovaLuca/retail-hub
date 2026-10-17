import { Trophy } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import type { StoreTotalRow } from "@/lib/kpi/monitoring";
import { formatCount, progressRatio } from "@/lib/kpi/sheet";
import { ProgressBar } from "./progress-bar";

/** Card "Negozio": totali della settimana vs obiettivo e best performer confermato (§8.3). */
export function StoreCard({
  rows,
  bestPerformerName,
  title = "Negozio",
}: {
  rows: StoreTotalRow[];
  bestPerformerName: string | null;
  title?: string;
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.kpiId} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{r.label}</span>
              <span className="nums">
                <span className="font-medium">{formatCount(r.done)}</span>
                {r.target !== null ? (
                  <span className="text-muted"> / {formatCount(r.target)}</span>
                ) : null}
              </span>
            </div>
            {r.target !== null ? (
              <ProgressBar ratio={progressRatio(r.done, r.target)} label={r.label} />
            ) : null}
          </li>
        ))}
      </ul>
      {bestPerformerName ? (
        <p className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-sm">
          <Trophy className="size-4 stroke-[1.5]" aria-hidden />
          <span className="eyebrow">Best performer</span>
          <span className="font-medium">{bestPerformerName}</span>
        </p>
      ) : null}
    </Card>
  );
}
