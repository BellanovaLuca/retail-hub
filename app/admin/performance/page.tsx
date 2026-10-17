import { redirect } from "next/navigation";
import { nowInRome } from "@/lib/dates";

export default function PerformanceIndexPage() {
  redirect(`/admin/performance/${nowInRome().getFullYear()}`);
}
