import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";

/** Card "I miei obiettivi della settimana" (collegata ai dati della milestone Obiettivi). */
export async function WeekTargetsCard({
  profileId,
  weekStart,
}: {
  profileId: string;
  weekStart: string;
}) {
  void profileId;
  void weekStart;
  return (
    <Card>
      <CardTitle>I miei obiettivi</CardTitle>
      <p className="text-sm text-muted">Compila i numeri della giornata e guarda a quanto sei.</p>
      <Link href="/obiettivi" className="mt-4 inline-block link-underline text-sm">
        Compila oggi
      </Link>
    </Card>
  );
}
