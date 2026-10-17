import { Paperclip, Pin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBadge } from "@/components/announcements/category-badge";
import { RemindButton } from "@/components/announcements/remind-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { PersonDot, Table, Td, Th } from "@/components/ui/table";
import { formatRomeDateTime } from "@/lib/announcements/model";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminAnnouncements, type AdminAnnouncement } from "@/lib/data/announcements";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comunicazioni" };

function StatusBadge({ a }: { a: AdminAnnouncement }) {
  if (a.status === "scheduled")
    return <Badge tone="warning">Programmata · {formatRomeDateTime(a.publishAt)}</Badge>;
  if (a.status === "expired") return <Badge>Scaduta</Badge>;
  return null;
}

export default async function AdminComunicazioniPage() {
  await requireAdmin();
  const supabase = await createClient();
  const list = await getAdminAnnouncements(supabase);
  const missingAcks = list
    .filter((a) => a.status === "live" && a.requiresAck)
    .reduce((sum, a) => sum + (a.recipients.length - a.ackCount), 0);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted nums">
          {list.length} comunicazioni
          {missingAcks > 0 ? ` · ${missingAcks} conferme di lettura mancanti` : ""}
        </p>
        <Button asChild>
          <Link href="/admin/comunicazioni/nuova">
            <Plus aria-hidden /> Nuova comunicazione
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Nessuna comunicazione ancora. Scrivi la prima per tutto il negozio." />
      ) : (
        <ol className="border-t border-line">
          {list.map((a) => {
            const total = a.recipients.length;
            const unread = total - a.readCount;
            const missing = a.requiresAck ? total - a.ackCount : unread;
            return (
              <li key={a.id} className="border-b border-line py-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {a.pinned ? (
                        <Pin className="size-3.5 stroke-[1.5]" aria-label="Fissata in alto" />
                      ) : null}
                      <CategoryBadge category={a.category} />
                      {a.requiresAck ? <Badge tone="neutral">Richiede conferma</Badge> : null}
                      <StatusBadge a={a} />
                    </div>
                    <h2 className="font-display text-xl font-normal tracking-tight">
                      <Link href={`/admin/comunicazioni/${a.id}`} className="link-underline">
                        {a.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-muted nums">
                      {formatRomeDateTime(a.publishAt)}
                      {a.authorName ? ` · ${a.authorName}` : ""} · Destinatari: {a.audienceLabel}
                      {a.attachmentsCount > 0 ? (
                        <>
                          {" · "}
                          <Paperclip className="inline size-3.5 stroke-[1.5]" aria-hidden />{" "}
                          {a.attachmentsCount}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 text-sm nums">
                    {a.status === "scheduled" ? (
                      <span className="text-muted">{total} destinatari</span>
                    ) : (
                      <span>
                        <span className="font-medium">{a.readCount}</span>
                        <span className="text-muted">/{total} lette</span>
                      </span>
                    )}
                    {a.requiresAck && a.status !== "scheduled" ? (
                      <span className={cn(total - a.ackCount > 0 && "text-warning")}>
                        <span className="font-medium">{a.ackCount}</span>/{total} confermate
                      </span>
                    ) : null}
                    {a.status === "live" ? (
                      <RemindButton announcementId={a.id} pending={missing} />
                    ) : null}
                  </div>
                </div>
                {total > 0 && a.status !== "scheduled" ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer py-2 eyebrow">
                      Letture per destinatario
                    </summary>
                    <Table className="mt-2 max-w-3xl">
                      <thead>
                        <tr>
                          <Th>Persona</Th>
                          <Th>Lettura</Th>
                          {a.requiresAck ? <Th>Conferma</Th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {a.recipients.map((r) => (
                          <tr key={r.profileId}>
                            <Td>
                              <span className="flex items-center gap-2">
                                <PersonDot color={r.color} /> {r.name}
                              </span>
                            </Td>
                            <Td className={r.readAt ? "" : "text-muted"}>
                              {r.readAt ? formatRomeDateTime(r.readAt) : "Non letta"}
                            </Td>
                            {a.requiresAck ? (
                              <Td className={r.acknowledgedAt ? "" : "text-warning"}>
                                {r.acknowledgedAt
                                  ? formatRomeDateTime(r.acknowledgedAt)
                                  : "Mancante"}
                              </Td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
