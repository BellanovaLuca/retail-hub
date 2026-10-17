import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { parseOpeningHours } from "@/lib/settings";
import { toISODate, nowInRome } from "@/lib/dates";
import { ExceptionsEditor, OpeningHoursForm } from "./hours-forms";

export const metadata: Metadata = { title: "Orari di apertura" };

export default async function OrariPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: exceptions }] = await Promise.all([
    supabase.from("store_settings").select("opening_hours").eq("id", true).single(),
    supabase
      .from("opening_exceptions")
      .select("*")
      .gte("date", toISODate(nowInRome()))
      .order("date"),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <OpeningHoursForm initial={parseOpeningHours(settings?.opening_hours)} />
      <ExceptionsEditor
        exceptions={(exceptions ?? []).map((e) => ({
          id: e.id,
          date: e.date,
          openTime: e.open_time?.slice(0, 5) ?? null,
          closeTime: e.close_time?.slice(0, 5) ?? null,
          note: e.note,
        }))}
      />
    </div>
  );
}
