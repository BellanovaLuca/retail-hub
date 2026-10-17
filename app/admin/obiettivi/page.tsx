import { redirect } from "next/navigation";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";

/** /admin/obiettivi → la settimana corrente. */
export default function ObiettiviIndexPage() {
  redirect(`/admin/obiettivi/${toISODate(weekStart(nowInRome()))}`);
}
