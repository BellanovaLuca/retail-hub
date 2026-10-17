import { redirect } from "next/navigation";
import { nowInRome } from "@/lib/dates";

export default function FerieIndexPage() {
  redirect(`/admin/ferie/${nowInRome().getFullYear()}`);
}
