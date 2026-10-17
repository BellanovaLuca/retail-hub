import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { nowInRome } from "@/lib/dates";
import { HolidaysEditor } from "./holidays-editor";

export const metadata: Metadata = { title: "Festività e chiusure" };

export default async function FestivitaPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>;
}) {
  const { anno } = await searchParams;
  const current = nowInRome().getFullYear();
  const year = Number(anno) >= 2020 && Number(anno) <= 2100 ? Number(anno) : current;
  const supabase = await createClient();
  const { data } = await supabase
    .from("holidays")
    .select("*")
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`)
    .order("date");

  return (
    <HolidaysEditor
      year={year}
      holidays={(data ?? []).map((h) => ({
        id: h.id,
        date: h.date,
        label: h.label,
        storeClosed: h.store_closed,
      }))}
    />
  );
}
