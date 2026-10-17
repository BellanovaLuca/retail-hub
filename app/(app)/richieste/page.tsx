import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requestSummary, StatusBadge } from "@/components/requests/request-parts";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireProfile } from "@/lib/auth/session";
import { namesById } from "@/lib/data/requests";
import { createClient } from "@/lib/supabase/server";
import { SwapResponse } from "./swap-response";

export const metadata: Metadata = { title: "Richieste" };

export default async function RichiestePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: mine }, { data: proposals }, names] = await Promise.all([
    supabase
      .from("requests")
      .select("*")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("requests")
      .select("*")
      .eq("target_profile_id", profile.id)
      .eq("type", "scambio_turno")
      .order("created_at", { ascending: false })
      .limit(30),
    namesById(supabase),
  ]);
  const openProposals = (proposals ?? []).filter((p) => p.status === "pending");

  return (
    <>
      <PageHeader eyebrow="Richieste" title="Le mie richieste" />
      <div className="mb-10">
        <Button asChild size="lg">
          <Link href="/richieste/nuova">
            <Plus aria-hidden /> Nuova richiesta
          </Link>
        </Button>
      </div>

      {openProposals.length > 0 ? (
        <section className="mb-12">
          <h2 className="mb-4 eyebrow">Scambi proposti a me</h2>
          <ul className="flex flex-col gap-3">
            {openProposals.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-lg border border-foreground p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {names.get(p.profile_id) ?? "Un collega"} ti propone uno scambio
                  </p>
                  <p className="text-sm text-muted">{requestSummary(p).detail}</p>
                  {p.message ? <p className="mt-1 text-sm">&laquo;{p.message}&raquo;</p> : null}
                  <Link href={`/richieste/${p.id}`} className="link-underline text-xs text-muted">
                    Dettagli
                  </Link>
                </div>
                <SwapResponse id={p.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(mine ?? []).length === 0 ? (
        <EmptyState title="Nessuna richiesta, per ora." />
      ) : (
        <ul className="border-t border-line">
          {(mine ?? []).map((r) => {
            const s = requestSummary(r);
            return (
              <li key={r.id} className="border-b border-line">
                <Link href={`/richieste/${r.id}`} className="flex min-h-16 items-center gap-4 py-3">
                  <span className="flex-1">
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-sm text-muted nums">{s.detail}</span>
                  </span>
                  <StatusBadge status={r.status} />
                  <ChevronRight className="size-4 stroke-[1.5] text-subtle" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
