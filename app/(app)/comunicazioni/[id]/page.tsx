import { ArrowLeft, Pin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AckButton } from "@/components/announcements/ack-button";
import { AttachmentList } from "@/components/announcements/attachment-list";
import { CategoryBadge } from "@/components/announcements/category-badge";
import { Markdown } from "@/components/announcements/markdown";
import { MarkRead } from "@/components/announcements/mark-read";
import { formatRomeDateTime } from "@/lib/announcements/model";
import { signAttachments } from "@/lib/announcements/storage";
import { requireProfile } from "@/lib/auth/session";
import { getAnnouncementForReader } from "@/lib/data/announcements";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Comunicazione" };

export default async function ComunicazionePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const entry = await getAnnouncementForReader(supabase, id, profile.id);
  if (!entry) notFound();
  const attachments = await signAttachments(entry.attachments);

  return (
    <article className="max-w-3xl">
      <MarkRead announcementId={entry.id} />
      <Link
        href="/comunicazioni"
        className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4 stroke-[1.5]" aria-hidden /> Bacheca
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {entry.pinned ? (
          <span className="inline-flex items-center gap-1 eyebrow text-foreground">
            <Pin className="size-3.5 stroke-[1.5]" aria-hidden /> In evidenza
          </span>
        ) : null}
        <CategoryBadge category={entry.category} />
      </div>
      <h2 className="font-display text-3xl leading-tight font-light tracking-tight sm:text-4xl">
        {entry.title}
      </h2>
      <p className="mt-2 text-sm text-muted nums">
        {formatRomeDateTime(entry.publish_at)}
        {entry.authorName ? ` · ${entry.authorName}` : ""}
        {entry.expiresAt ? ` · visibile fino a ${formatRomeDateTime(entry.expiresAt)}` : ""}
      </p>
      <div className="mt-8">
        <Markdown source={entry.bodyMd} />
      </div>
      <AttachmentList items={attachments} />
      {entry.requires_ack ? (
        <div className="mt-10 border-t border-line pt-8">
          <AckButton announcementId={entry.id} acknowledgedAt={entry.acknowledgedAt} />
        </div>
      ) : null}
    </article>
  );
}
