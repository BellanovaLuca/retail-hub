import { Pin, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AttachmentList } from "@/components/announcements/attachment-list";
import { CategoryBadge } from "@/components/announcements/category-badge";
import { Markdown } from "@/components/announcements/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import {
  CATEGORIES,
  categoryLabels,
  formatRomeDateTime,
  type Category,
} from "@/lib/announcements/model";
import { signAttachments } from "@/lib/announcements/storage";
import { requireProfile } from "@/lib/auth/session";
import { getFeed } from "@/lib/data/announcements";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comunicazioni" };

function hrefWith(params: { categoria?: string | null; q?: string | null }) {
  const sp = new URLSearchParams();
  if (params.categoria) sp.set("categoria", params.categoria);
  if (params.q) sp.set("q", params.q);
  const s = sp.toString();
  return s ? `/comunicazioni?${s}` : "/comunicazioni";
}

export default async function BachecaPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const category = (CATEGORIES as readonly string[]).includes(sp.categoria ?? "")
    ? (sp.categoria as Category)
    : null;
  const q = sp.q?.slice(0, 100) ?? "";

  const supabase = await createClient();
  const entries = await getFeed(supabase, profile.id, { category, q });
  const signed = await signAttachments(entries.flatMap((e) => e.attachments));
  const signedByPath = new Map(signed.map((a) => [a.path, a]));

  return (
    <>
      <div className="mb-10 flex flex-col gap-5">
        <form action="/comunicazioni" role="search" className="flex max-w-xl gap-2">
          {category ? <input type="hidden" name="categoria" value={category} /> : null}
          <label htmlFor="cerca" className="sr-only">
            Cerca nelle comunicazioni
          </label>
          <Input
            id="cerca"
            name="q"
            defaultValue={q}
            placeholder="Cerca per titolo, testo o autore"
          />
          <Button type="submit" variant="secondary" size="icon" aria-label="Cerca">
            <Search aria-hidden />
          </Button>
        </form>
        <nav aria-label="Categorie" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2">
            {[null, ...CATEGORIES].map((c) => {
              const active = c === category;
              return (
                <li key={c ?? "tutte"}>
                  <Link
                    href={hrefWith({ categoria: c, q })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-sm border px-3 text-xs font-medium tracking-[0.06em] uppercase transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-line-strong text-muted hover:border-foreground hover:text-foreground",
                    )}
                  >
                    {c ? categoryLabels[c] : "Tutte"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title={
            q || category ? "Nessuna comunicazione trovata." : "Nessuna comunicazione, per ora."
          }
        >
          {q || category ? <Link href="/comunicazioni">Mostra tutte</Link> : null}
        </EmptyState>
      ) : (
        <ol className="flex flex-col border-t border-line">
          {entries.map((e) => {
            const toAck = e.requires_ack && !e.acknowledged;
            return (
              <li key={e.id} className="border-b border-line py-8">
                <article aria-labelledby={`titolo-${e.id}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {e.pinned ? (
                      <span className="inline-flex items-center gap-1 eyebrow text-foreground">
                        <Pin className="size-3.5 stroke-[1.5]" aria-hidden /> In evidenza
                      </span>
                    ) : null}
                    <CategoryBadge category={e.category} />
                    {toAck ? <Badge tone="warning">Da confermare</Badge> : null}
                    {!e.read ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
                        Non letta
                      </span>
                    ) : null}
                  </div>
                  <h2
                    id={`titolo-${e.id}`}
                    className={cn(
                      "font-display text-2xl leading-snug tracking-tight",
                      e.read ? "font-light" : "font-normal",
                    )}
                  >
                    <Link href={`/comunicazioni/${e.id}`} className="link-underline">
                      {e.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted nums">
                    {formatRomeDateTime(e.publish_at)}
                    {e.authorName ? ` · ${e.authorName}` : ""}
                  </p>
                  <div className="relative mt-4 max-h-44 overflow-hidden">
                    <Markdown source={e.bodyMd} />
                  </div>
                  <AttachmentList
                    items={e.attachments.map(
                      (a) => signedByPath.get(a.path) ?? { ...a, url: null },
                    )}
                  />
                  <p className="mt-5">
                    <Button asChild variant={toAck ? "primary" : "secondary"} size="sm">
                      <Link href={`/comunicazioni/${e.id}`}>
                        {toAck ? "Leggi e conferma" : "Leggi tutto"}
                      </Link>
                    </Button>
                  </p>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
