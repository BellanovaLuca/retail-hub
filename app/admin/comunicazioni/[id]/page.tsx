import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementEditor } from "@/components/announcements/editor";
import { parseAttachments, toRomeLocalInput } from "@/lib/announcements/model";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPickerData } from "../editor-data";

export const metadata: Metadata = { title: "Modifica comunicazione" };

export default async function ModificaComunicazionePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: a }, picker] = await Promise.all([
    supabase.from("announcements").select("*").eq("id", id).maybeSingle(),
    getPickerData(supabase),
  ]);
  if (!a) notFound();
  const alreadyPublished = new Date(a.publish_at) <= new Date();

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-light tracking-tight">Modifica comunicazione</h2>
        {alreadyPublished ? (
          <Link href={`/comunicazioni/${a.id}`} className="link-underline text-sm text-muted">
            Vedi come la vedono i destinatari
          </Link>
        ) : null}
      </div>
      <AnnouncementEditor
        isNew={false}
        alreadyPublished={alreadyPublished}
        departments={picker.departments}
        people={picker.people}
        initial={{
          id: a.id,
          title: a.title,
          body: a.body_md,
          category: a.category,
          audience: a.audience,
          departmentIds: a.department_ids,
          profileIds: a.profile_ids,
          pinned: a.pinned,
          requiresAck: a.requires_ack,
          publishAt: toRomeLocalInput(a.publish_at),
          expiresAt: toRomeLocalInput(a.expires_at),
          attachments: parseAttachments(a.attachments),
        }}
      />
    </>
  );
}
