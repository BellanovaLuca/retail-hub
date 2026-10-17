import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { PersonDot } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth/session";
import { getPublishedShifts, normalizeWeekParam, weekDates } from "@/lib/data/schedule";
import { nowInRome, toISODate, weekNumber } from "@/lib/dates";
import { publishedDayText } from "@/lib/schedule/cells";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Turni" };

/** Pagina della persona: i suoi turni pubblicati e nient'altro (§6.1). */
export default async function PersonaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ settimana?: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const { settimana } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("public_profiles")
    .select("id, display_name, color, active")
    .eq("id", id)
    .maybeSingle();
  if (!person) notFound();

  const now = nowInRome();
  const today = toISODate(now);
  const weekStart = normalizeWeekParam(settimana, now);
  const days = weekDates(weekStart);
  const shifts = await getPublishedShifts(supabase, days[0], days[6], id);
  const prev = toISODate(addDays(parseISO(weekStart), -7));
  const next = toISODate(addDays(parseISO(weekStart), 7));

  return (
    <>
      <Link href="/orari/negozio" className="link-underline eyebrow">
        ← Griglia del negozio
      </Link>
      <div className="mt-6">
        <PageHeader
          eyebrow={`Week ${weekNumber(parseISO(weekStart))}`}
          title={person.display_name ?? ""}
        >
          <span className="flex items-center gap-2">
            <PersonDot color={person.color} /> Turni pubblicati
          </span>
        </PageHeader>
      </div>
      <div className="mb-6 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Settimana precedente">
          <Link href={`/persone/${id}?settimana=${prev}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="Settimana successiva">
          <Link href={`/persone/${id}?settimana=${next}`}>
            <ChevronRight />
          </Link>
        </Button>
      </div>
      <ol className="border-t border-line">
        {days.map((d) => {
          const text = publishedDayText(
            shifts.filter((s) => s.date === d),
            true,
          );
          return (
            <li
              key={d}
              className={cn(
                "grid grid-cols-[8rem_1fr] items-baseline gap-4 border-b border-line py-4",
                d === today && "border-t-[3px] border-t-foreground",
              )}
            >
              <span className="eyebrow text-foreground capitalize">
                {format(parseISO(d), "EEEE d", { locale: it })}
              </span>
              <span className={cn("font-display text-xl font-light nums", !text && "text-subtle")}>
                {text || "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
