import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { formatLong, nowInRome } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cruscotto" };

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { count: activeStaff } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  const placeholders = [
    "Richieste in attesa",
    "Settimane da pubblicare",
    "Buchi di copertura",
    "Conferme di lettura mancanti",
    "Assenti oggi e domani",
  ];

  return (
    <>
      <PageHeader eyebrow={formatLong(nowInRome())} title="Cruscotto" />
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardTitle>Persone attive</CardTitle>
          <p className="font-display text-5xl font-light nums">{activeStaff ?? 0}</p>
        </Card>
        {placeholders.map((title) => (
          <Card key={title}>
            <CardTitle>{title}</CardTitle>
            <p className="font-display text-xl font-light text-subtle">In preparazione.</p>
          </Card>
        ))}
      </div>
    </>
  );
}
