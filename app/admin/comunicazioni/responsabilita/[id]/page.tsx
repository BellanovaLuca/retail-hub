import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatRomeDateTime } from "@/lib/announcements/model";
import { ResponsibilityEditor } from "@/components/responsibilities/responsibility-editor";
import { requireAdmin } from "@/lib/auth/session";
import { getAssignmentHistory, getResponsibilities } from "@/lib/data/responsibilities";
import { createClient } from "@/lib/supabase/server";
import { getPickerData } from "../../editor-data";

export const metadata: Metadata = { title: "Modifica attività" };

const roleLabel = { owner: "responsabile", support: "supporto" } as const;

export default async function ModificaResponsabilitaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [items, { people }, history] = await Promise.all([
    getResponsibilities(supabase, { includeInactive: true }),
    getPickerData(supabase),
    getAssignmentHistory(supabase, id),
  ]);
  const r = items.find((x) => x.id === id);
  if (!r) notFound();

  return (
    <>
      <h2 className="mb-8 font-display text-2xl font-light tracking-tight">{r.title}</h2>
      <ResponsibilityEditor
        isNew={false}
        people={people}
        initial={{
          id: r.id,
          title: r.title,
          description: r.descriptionMd,
          scheduleDays: r.scheduleDays,
          active: r.active,
          allStaff: r.allStaff,
          ownerId: r.ownerId,
          supportIds: r.supportIds,
          attachments: r.attachments,
        }}
      />

      <section aria-labelledby="storico" className="mt-16">
        <h2 id="storico" className="mb-2 eyebrow">
          Storico delle assegnazioni
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Dal registro modifiche: chi è stato assegnato o tolto, quando e da chi.
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-subtle">Nessuna modifica registrata.</p>
        ) : (
          <ol className="max-w-2xl border-t border-line">
            {history.map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 border-b border-line py-2.5 text-sm">
                <span className="w-40 shrink-0 text-muted nums">{formatRomeDateTime(h.at)}</span>
                <span className="flex-1">
                  {h.action === "insert" ? "Assegnata a " : "Tolta a "}
                  <strong className="font-semibold">{h.personName}</strong> come {roleLabel[h.role]}
                  {h.actorName ? <span className="text-muted"> · da {h.actorName}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
