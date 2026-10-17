import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";
import { namesById } from "@/lib/data/requests";
import { awaitsAdmin, REQUEST_TYPES, type RequestStatus } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { RequestsTable } from "./requests-table";

export const metadata: Metadata = { title: "Richieste" };

const TABS = [
  { key: "attesa", label: "In attesa" },
  { key: "approvate", label: "Approvate" },
  { key: "rifiutate", label: "Rifiutate" },
  { key: "tutte", label: "Tutte" },
] as const;

export default async function AdminRichiestePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tipo?: string; persona?: string }>;
}) {
  await requireAdmin();
  const q = await searchParams;
  const tab = TABS.find((t) => t.key === q.tab)?.key ?? "attesa";
  const supabase = await createClient();

  let query = supabase.from("requests").select("*").order("start_date").limit(300);
  if (tab === "approvate")
    query = query.eq("status", "approved").order("decided_at", { ascending: false });
  if (tab === "rifiutate") query = query.in("status", ["rejected", "peer_declined"]);
  if (tab === "attesa") query = query.in("status", ["pending", "peer_accepted"]);
  const tipo = REQUEST_TYPES.find((t) => t.value === q.tipo)?.value;
  if (tipo) query = query.eq("type", tipo);
  if (q.persona) query = query.eq("profile_id", q.persona);
  const [{ data }, names] = await Promise.all([query, namesById(supabase)]);

  const rows = (data ?? [])
    .filter(
      (r) =>
        tab !== "attesa" ||
        awaitsAdmin({ type: r.type, status: r.status as RequestStatus }) ||
        r.status === "pending",
    )
    .map((r) => ({
      id: r.id,
      person: names.get(r.profile_id) ?? "—",
      target: r.target_profile_id ? (names.get(r.target_profile_id) ?? "—") : null,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      startTime: r.start_time,
      endTime: r.end_time,
      hours: r.hours,
      recurring: r.recurring_weekdays,
      status: r.status as RequestStatus,
      message: r.message,
      createdAt: r.created_at,
      decidable: awaitsAdmin({ type: r.type, status: r.status as RequestStatus }),
    }));

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({
      ...(q.tipo ? { tipo: q.tipo } : {}),
      ...(q.persona ? { persona: q.persona } : {}),
      tab,
    });
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader eyebrow="Approvazioni" title="Richieste" />
      <nav aria-label="Stato" className="mb-6 flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs({ tab: t.key })}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 items-center border-b-2 text-sm",
              tab === t.key
                ? "border-foreground font-medium"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link
          href={qs({ tipo: undefined })}
          className={cn(
            "border px-3 py-1.5",
            !q.tipo ? "border-foreground" : "border-line text-muted",
          )}
        >
          Tutti i tipi
        </Link>
        {REQUEST_TYPES.map((t) => (
          <Link
            key={t.value}
            href={qs({ tipo: t.value })}
            className={cn(
              "border px-3 py-1.5",
              q.tipo === t.value ? "border-foreground" : "border-line text-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
        {q.persona ? (
          <Link href={qs({ persona: undefined })} className="border border-foreground px-3 py-1.5">
            {names.get(q.persona)} ✕
          </Link>
        ) : null}
      </div>
      <RequestsTable rows={rows} selectable={tab === "attesa"} />
    </>
  );
}
