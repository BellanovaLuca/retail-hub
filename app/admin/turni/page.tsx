import { redirect } from "next/navigation";
import { nowInRome, toISODate, weekStart } from "@/lib/dates";

export default function TurniIndexPage() {
  redirect(`/admin/turni/${toISODate(weekStart(nowInRome()))}`);
}
