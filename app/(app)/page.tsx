import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { formatLong, formatShortDay, nowInRome, weekDays, weekNumber } from "@/lib/dates";
import { requireProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

function greeting(hour: number) {
  if (hour < 13) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default async function HomePage() {
  const profile = await requireProfile();
  const now = nowInRome();
  const today = formatLong(now);

  return (
    <>
      <PageHeader eyebrow={today} title={`${greeting(now.getHours())}, ${profile.display_name}`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Prossimo turno</CardTitle>
          <p className="font-display text-3xl font-light text-subtle">
            Gli orari arrivano con la prima settimana pubblicata.
          </p>
        </Card>

        <Card>
          <CardTitle>Ore della settimana</CardTitle>
          <p className="font-display text-3xl font-light nums">
            — <span className="text-subtle">/ {profile.weekly_hours ?? "—"} h</span>
          </p>
        </Card>

        <Card className="lg:col-span-3">
          <CardTitle>La mia settimana · Week {weekNumber(now)}</CardTitle>
          <ol className="grid grid-cols-7 gap-1.5 sm:gap-3">
            {weekDays(now).map((day) => {
              const isToday = day.toDateString() === now.toDateString();
              return (
                <li
                  key={day.toISOString()}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "flex aspect-[3/4] flex-col justify-between border border-line p-1.5 sm:aspect-auto sm:min-h-24 sm:p-3",
                    isToday && "border-t-[3px] border-t-foreground",
                  )}
                >
                  <span className="eyebrow text-[0.625rem] sm:text-[0.6875rem]">
                    {formatShortDay(day)}
                  </span>
                  <span className="text-xs text-subtle nums sm:text-sm">—</span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}
