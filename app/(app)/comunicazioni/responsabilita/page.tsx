import type { Metadata } from "next";
import Link from "next/link";
import { PersonFilter } from "@/components/responsibilities/person-filter";
import { ResponsibilityOverview } from "@/components/responsibilities/overview";
import { signAttachments } from "@/lib/announcements/storage";
import { requireProfile } from "@/lib/auth/session";
import { getPeopleDirectory } from "@/lib/data/announcements";
import { getResponsibilities } from "@/lib/data/responsibilities";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Responsabilità" };

/** Panoramica unica: chi si occupa di cosa in negozio, per tutti, con il proprio nome evidenziato. */
export default async function ResponsabilitaPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = await createClient();
  const people = await getPeopleDirectory(supabase, { includeInactive: true });
  const items = await getResponsibilities(supabase, {
    people: new Map(people.map((p) => [p.id, p])),
  });

  const active = people.filter((p) => p.active);
  const persona = sp.persona && active.some((p) => p.id === sp.persona) ? sp.persona : null;
  const signed = await signAttachments(items.flatMap((r) => r.attachments));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted">
            Chi si occupa di cosa in negozio. Il tuo nome è evidenziato; scegli un collega per
            evidenziare il suo.
          </p>
          <Link
            href="/comunicazioni/responsabilita/spunte"
            className="link-underline text-sm font-medium"
          >
            Segna le attività fatte →
          </Link>
        </div>
        <PersonFilter
          people={active.map((p) => ({ id: p.id, name: p.displayName }))}
          viewerId={profile.id}
          selected={persona}
          allLabel="Il mio nome"
          hideMine
        />
      </div>
      <ResponsibilityOverview
        items={items}
        people={people}
        viewerId={profile.id}
        highlightId={persona ?? profile.id}
        attachments={new Map(signed.map((a) => [a.path, a]))}
      />
    </div>
  );
}
