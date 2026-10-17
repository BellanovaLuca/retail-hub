import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getMyWeekSummary } from "@/lib/data/targets";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** Card "I miei obiettivi della settimana" (§6.1): voci principali e "Compila oggi". */
export async function WeekTargetsCard({
  profileId,
  weekStart,
}: {
  profileId: string;
  weekStart: string;
}) {
  const summary = await getMyWeekSummary(await createClient(), profileId, weekStart, 4);
  const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });

  return (
    <Card>
      <CardTitle>I miei obiettivi · Week {summary.weekNumber}</CardTitle>
      {summary.items.length ? (
        <ul className="mb-5 flex flex-col gap-3">
          {summary.items.map((i) => (
            <li key={i.kpiId}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span>{i.label}</span>
                <span className="text-muted nums">
                  {fmt(i.done)}
                  {i.target != null ? ` / ${fmt(i.target)}` : ""}
                  {i.reached && i.target != null ? " ✓" : ""}
                </span>
              </div>
              <div className="mt-1 h-0.5 bg-line" aria-hidden>
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${Math.round(Math.min(1, i.ratio) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-sm text-muted">
          Gli obiettivi della settimana non sono ancora stati assegnati.
        </p>
      )}
      <Button
        asChild
        variant={summary.filledToday ? "secondary" : "primary"}
        size="sm"
        className={cn(!summary.filledToday && "w-full sm:w-auto")}
      >
        <Link href={summary.href}>
          {summary.filledToday ? "Aggiorna i numeri di oggi" : "Compila oggi"}
        </Link>
      </Button>
    </Card>
  );
}
