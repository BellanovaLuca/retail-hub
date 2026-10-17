import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { ACTION_LABELS, ENTITY_LABELS, subjectProfileId, summarizeDiff } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { namesById } from "@/lib/data/requests";
import { createClient } from "@/lib/supabase/server";
import { RegistryFilters } from "./registry-filters";

export const metadata: Metadata = { title: "Registro modifiche" };

const PAGE = 50;

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ autore?: string; persona?: string; tipo?: string; pagina?: string }>;
}) {
  await requireAdmin();
  const q = await searchParams;
  const page = Math.max(0, Number(q.pagina) || 0);
  const supabase = await createClient();
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (uuid(q.autore)) query = query.eq("actor_id", q.autore!);
  if (q.tipo && ENTITY_LABELS[q.tipo]) query = query.eq("entity", q.tipo);
  if (uuid(q.persona)) {
    const p = q.persona!;
    query = query.or(
      `entity_id.eq.${p},diff->>profile_id.eq.${p},diff->profile_id->>after.eq.${p},diff->profile_id->>before.eq.${p}`,
    );
  }

  const [{ data: rows, count }, names, { data: admins }, { data: people }] = await Promise.all([
    query,
    namesById(supabase),
    supabase.from("profiles").select("id, display_name").eq("role", "admin").order("display_name"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);
  const total = count ?? 0;
  const params = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(
      Object.entries({ autore: q.autore, persona: q.persona, tipo: q.tipo, ...patch }).filter(
        (e): e is [string, string] => Boolean(e[1]),
      ),
    );
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader eyebrow="Audit" title="Registro modifiche">
        Ogni modifica fatta da un amministratore, con chi l&apos;ha fatta e quando.
      </PageHeader>
      <RegistryFilters
        values={{ autore: q.autore ?? "", persona: q.persona ?? "", tipo: q.tipo ?? "" }}
        admins={(admins ?? []).map((a) => ({ id: a.id, name: a.display_name }))}
        people={(people ?? []).map((a) => ({ id: a.id, name: a.display_name }))}
        types={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))}
      />
      {(rows ?? []).length === 0 ? (
        <p className="py-16 font-display text-2xl font-light text-subtle">
          Nessuna modifica trovata.
        </p>
      ) : (
        <ol className="border-t border-line">
          {(rows ?? []).map((r) => {
            const subject = subjectProfileId(r.entity, r.entity_id, r.diff);
            const lines = summarizeDiff(r.action, r.diff);
            return (
              <li
                key={r.id}
                className="grid gap-2 border-b border-line py-3 sm:grid-cols-[10rem_1fr]"
              >
                <div className="text-xs text-muted nums">
                  {format(parseISO(r.at), "d MMM yyyy · HH:mm", { locale: it })}
                  <p className="text-sm text-foreground">
                    {r.actor_id ? (names.get(r.actor_id) ?? "—") : "Sistema"}
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{ACTION_LABELS[r.action] ?? r.action}</span> ·{" "}
                    {ENTITY_LABELS[r.entity] ?? r.entity}
                    {subject && names.get(subject) ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href={params({ persona: subject, pagina: undefined })}
                          className="link-underline"
                        >
                          {names.get(subject)}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  {lines.length ? (
                    <ul className="mt-1 text-xs text-muted nums">
                      {lines.map((l, i) => (
                        <li key={i} className="break-all">
                          {l}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-6 flex items-center justify-between text-sm text-muted">
        <span className="nums">
          {total ? `${page * PAGE + 1}–${Math.min(total, page * PAGE + PAGE)} di ${total}` : ""}
        </span>
        <span className="flex gap-2">
          {page > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={params({ pagina: String(page - 1) })}>Più recenti</Link>
            </Button>
          ) : null}
          {(page + 1) * PAGE < total ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={params({ pagina: String(page + 1) })}>Meno recenti</Link>
            </Button>
          ) : null}
        </span>
      </div>
    </>
  );
}
