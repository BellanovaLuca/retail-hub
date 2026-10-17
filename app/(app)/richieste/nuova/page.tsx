import { addDays, format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/feedback";
import { requireProfile } from "@/lib/auth/session";
import { getPublicPeople, getPublishedShifts } from "@/lib/data/schedule";
import { nowInRome, toISODate } from "@/lib/dates";
import { REQUEST_TYPES, type DayOccupation, type RequestType } from "@/lib/requests";
import { publishedDayText } from "@/lib/schedule/cells";
import { createClient } from "@/lib/supabase/server";
import { RequestWizard, type ShiftOption } from "./request-wizard";

export const metadata: Metadata = { title: "Nuova richiesta" };

export default async function NuovaRichiestaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; dal?: string; al?: string; turno?: string }>;
}) {
  const profile = await requireProfile();
  const q = await searchParams;
  const supabase = await createClient();
  const today = toISODate(nowInRome());
  // Cambio e scambio si chiedono sui turni già pubblicati: circa 4 mesi in avanti.
  const horizon = format(addDays(nowInRome(), 120), "yyyy-MM-dd");
  const [published, people, { data: leaves }] = await Promise.all([
    getPublishedShifts(supabase, today, horizon),
    getPublicPeople(supabase),
    supabase
      .from("leaves_public")
      .select("profile_id, date, kind, status")
      .gte("date", today)
      .lte("date", horizon),
  ]);

  // Agenda di tutti (turni pubblicati e assenze) per avvisare se chi riceve un turno in uno
  // scambio è già occupato quel giorno. Delle assenze altrui si vede solo "ferie"/"assente".
  const occupations: DayOccupation[] = [
    ...published.map((s) => ({
      profileId: s.profile_id,
      date: s.date,
      kind: s.is_absence || !s.start_time ? ("assenza" as const) : ("turno" as const),
      text: s.is_absence || !s.start_time ? "assente" : `${s.start_time}–${s.end_time ?? ""}`,
    })),
    ...(leaves ?? []).map((l) => ({
      profileId: l.profile_id!,
      date: l.date!,
      kind: "assenza" as const,
      text: `${l.kind === "ferie" ? "in ferie" : "assente"}${l.status === "tentative" ? " (da confermare)" : ""}`,
    })),
  ];

  const toOption = (s: (typeof published)[number]): ShiftOption => ({
    id: s.id,
    profileId: s.profile_id,
    date: s.date,
    text: publishedDayText(
      published.filter((x) => x.profile_id === s.profile_id && x.date === s.date),
    ),
  });
  // Un'opzione per giornata (il primo pezzo rappresenta anche gli spezzati).
  const seen = new Set<string>();
  const options = published
    .filter((s) => !s.is_absence && s.start_time)
    .filter((s) => {
      const k = `${s.profile_id}|${s.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(toOption);

  const isType = (v: string | undefined): v is RequestType =>
    REQUEST_TYPES.some((t) => t.value === v);
  const iso = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

  return (
    <>
      <Link href="/richieste" className="link-underline eyebrow">
        ← Richieste
      </Link>
      <div className="mt-6">
        <PageHeader title="Nuova richiesta" />
      </div>
      <RequestWizard
        me={profile.id}
        today={today}
        initial={{
          type: isType(q.tipo) ? q.tipo : undefined,
          startDate: iso(q.dal),
          endDate: iso(q.al),
          shiftId: q.turno && /^[0-9a-f-]{36}$/.test(q.turno) ? q.turno : undefined,
        }}
        myShifts={options.filter((o) => o.profileId === profile.id)}
        colleagueShifts={options.filter((o) => o.profileId !== profile.id)}
        occupations={occupations}
        colleagues={people
          .filter((p) => p.id !== profile.id)
          .map((p) => ({ id: p.id, name: p.displayName }))}
      />
    </>
  );
}
