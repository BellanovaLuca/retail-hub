import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requestSummary } from "@/components/requests/request-parts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";
import { getRequestsBetween, namesById } from "@/lib/data/requests";
import { nowInRome, toISODate } from "@/lib/dates";
import {
  awaitsAdmin,
  deleteGroupStatuses,
  isDeletable,
  REQUEST_TYPES,
  requestTypeLabel,
  type DeleteGroup,
  type RequestStatus,
  type RequestType,
} from "@/lib/requests";
import {
  calendarTone,
  monthGridDays,
  monthLabel,
  parseCalendarMonth,
  requestsByDay,
  shiftMonth,
} from "@/lib/requests/calendar";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { DeleteDecidedDialog } from "./delete-decided-dialog";
import { RequestsCalendar, type CalendarEntry } from "./requests-calendar";
import { RequestsTable } from "./requests-table";
import { ResetRequestsDialog } from "./reset-dialog";

export const metadata: Metadata = { title: "Richieste" };

const TABS = [
  { key: "attesa", label: "In attesa" },
  { key: "approvate", label: "Approvate" },
  { key: "rifiutate", label: "Rifiutate" },
  { key: "tutte", label: "Tutte" },
  { key: "calendario", label: "Calendario" },
] as const;

type Tab = (typeof TABS)[number]["key"];
type Db = Awaited<ReturnType<typeof createClient>>;
type Filters = { type?: RequestType; profileId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminRichiestePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tipo?: string; persona?: string; mese?: string }>;
}) {
  await requireAdmin();
  const q = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === q.tab)?.key ?? "attesa";
  const supabase = await createClient();
  const tipo = REQUEST_TYPES.find((t) => t.value === q.tipo)?.value;
  const persona = q.persona && UUID.test(q.persona) ? q.persona : undefined;
  const filters: Filters = { type: tipo, profileId: persona };
  // Mese del calendario: quello dell'URL se è un mese vero, altrimenti quello di oggi (Roma).
  const today = toISODate(nowInRome());
  const month = parseCalendarMonth(q.mese) ?? today.slice(0, 7);

  // Conteggi per la finestra «Azzera»: li conta il database (senza leggere le righe, che oltre
  // le 1000 verrebbero troncate).
  const countRequests = async (statuses?: RequestStatus[], only: Filters = {}) => {
    let c = supabase.from("requests").select("id", { count: "exact", head: true });
    if (statuses) c = c.in("status", statuses);
    if (only.type) c = c.eq("type", only.type);
    if (only.profileId) c = c.eq("profile_id", only.profileId);
    return (await c).count ?? 0;
  };
  const [names, total, pending, approved] = await Promise.all([
    namesById(supabase),
    countRequests(),
    countRequests(["pending", "peer_accepted"]),
    countRequests(["approved"]),
  ]);
  const counts = { total, pending, approved, other: Math.max(0, total - pending - approved) };

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({
      ...(tipo ? { tipo } : {}),
      ...(persona ? { persona } : {}),
      tab,
      ...(tab === "calendario" && q.mese && parseCalendarMonth(q.mese) ? { mese: month } : {}),
    });
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `?${p.toString()}`;
  };
  const filterLabel =
    [tipo ? requestTypeLabel(tipo) : null, persona ? (names.get(persona) ?? null) : null]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <>
      <PageHeader eyebrow="Approvazioni" title="Richieste">
        <div className="-ml-3 flex flex-wrap items-center gap-3">
          <ResetRequestsDialog counts={counts} />
        </div>
      </PageHeader>
      <nav aria-label="Stato" className="-mx-5 mb-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-6 border-b border-line">
          {TABS.map((t) => (
            <Link
              key={t.key}
              // Il mese vale solo per il calendario: cambiando scheda non resta nell'indirizzo.
              href={qs({ tab: t.key, mese: undefined })}
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
        </div>
      </nav>
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link
          href={qs({ tipo: undefined })}
          className={cn(
            "border px-3 py-1.5",
            !tipo ? "border-foreground" : "border-line text-muted",
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
              tipo === t.value ? "border-foreground" : "border-line text-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
        {persona ? (
          <Link href={qs({ persona: undefined })} className="border border-foreground px-3 py-1.5">
            {names.get(persona) ?? "Persona"} ✕
          </Link>
        ) : null}
      </div>
      {tab === "calendario" ? (
        <CalendarTab
          db={supabase}
          names={names}
          filters={filters}
          month={month}
          today={today}
          href={(m) => qs({ mese: m })}
        />
      ) : (
        <ListTab
          db={supabase}
          names={names}
          tab={tab}
          filters={filters}
          filterLabel={filterLabel}
          countRequests={countRequests}
        />
      )}
    </>
  );
}

/** Schede a elenco: In attesa, Approvate, Rifiutate, Tutte. */
async function ListTab({
  db,
  names,
  tab,
  filters,
  filterLabel,
  countRequests,
}: {
  db: Db;
  names: Map<string, string>;
  tab: Exclude<Tab, "calendario">;
  filters: Filters;
  filterLabel?: string;
  countRequests: (statuses?: RequestStatus[], only?: Filters) => Promise<number>;
}) {
  // In attesa: per data d'inizio (le più vicine in alto). Nelle altre schede dalle più recenti:
  // con l'ordine crescente e il limite di 300 righe le ultime richieste sparirebbero dall'elenco.
  let query = db.from("requests").select("*").limit(300);
  if (tab === "attesa")
    query = query.in("status", ["pending", "peer_accepted"]).order("start_date");
  else if (tab === "approvate")
    query = query
      .eq("status", "approved")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .order("start_date", { ascending: false });
  else {
    if (tab === "rifiutate") query = query.in("status", ["rejected", "peer_declined"]);
    query = query.order("created_at", { ascending: false });
  }
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.profileId) query = query.eq("profile_id", filters.profileId);

  // «Elimina tutte le approvate / rifiutate»: quante sono lo dice il database, con gli stessi
  // filtri dell'elenco (che mostra al massimo 300 righe).
  const group: DeleteGroup | null =
    tab === "approvate" ? "approved" : tab === "rifiutate" ? "rejected" : null;
  const [{ data }, groupCount, cancelledCount] = await Promise.all([
    query,
    group ? countRequests(deleteGroupStatuses(group), filters) : 0,
    group === "rejected" ? countRequests(["cancelled"], filters) : 0,
  ]);

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
      deletable: isDeletable(r.status as RequestStatus),
    }));

  return (
    <>
      {group ? (
        <div className="mb-4">
          <DeleteDecidedDialog
            group={group}
            count={groupCount}
            cancelledCount={cancelledCount}
            filters={filters}
            filterLabel={filterLabel}
          />
        </div>
      ) : null}
      <RequestsTable rows={rows} selectable={tab === "attesa"} />
    </>
  );
}

/** Scheda «Calendario»: tutte le richieste del mese, di ogni stato, giorno per giorno. */
async function CalendarTab({
  db,
  names,
  filters,
  month,
  today,
  href,
}: {
  db: Db;
  names: Map<string, string>;
  filters: Filters;
  month: string;
  today: string;
  href: (month: string | undefined) => string;
}) {
  const grid = monthGridDays(month);
  const requests = await getRequestsBetween(db, grid[0], grid[grid.length - 1], filters);
  const person = (id: string) => names.get(id) ?? "—";
  // Per nome: dentro ogni giorno l'ordine resta questo, a parità di stato.
  const sorted = [...requests].sort(
    (a, b) =>
      person(a.profile_id).localeCompare(person(b.profile_id), "it") ||
      a.start_date.localeCompare(b.start_date) ||
      a.id.localeCompare(b.id),
  );
  const byDay = requestsByDay(sorted, grid);

  const entries: Record<string, CalendarEntry> = {};
  for (const r of sorted) {
    const s = requestSummary(r);
    entries[r.id] = {
      id: r.id,
      person: person(r.profile_id),
      typeLabel:
        r.type === "scambio_turno" && r.target_profile_id
          ? `Scambio con ${person(r.target_profile_id)}`
          : s.title,
      detail: s.detail,
      status: r.status as RequestStatus,
      tone: calendarTone(r.status),
    };
  }
  const days = grid.map((date) => ({
    date,
    inMonth: date.startsWith(month),
    ids: (byDay.get(date) ?? []).map((r) => r.id),
  }));

  // Riepilogo del mese: solo le richieste che cadono in un giorno del mese (non nei giorni
  // delle settimane a cavallo, che appartengono ai mesi vicini).
  const inMonthIds = new Set(days.filter((d) => d.inMonth).flatMap((d) => d.ids));
  const tones = { pending: 0, approved: 0, closed: 0 };
  for (const id of inMonthIds) tones[entries[id].tone]++;
  const n = inMonthIds.size;

  return (
    <section aria-label={`Calendario delle richieste, ${monthLabel(month)}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Mese precedente">
            <Link href={href(shiftMonth(month, -1))}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-44 text-center font-display text-2xl font-light tracking-tight nums">
            {monthLabel(month)}
          </h2>
          <Button asChild variant="ghost" size="icon" aria-label="Mese successivo">
            <Link href={href(shiftMonth(month, 1))}>
              <ChevronRight />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="ml-2">
            <Link
              href={href(undefined)}
              aria-current={month === today.slice(0, 7) ? "true" : undefined}
            >
              Oggi
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted nums" data-testid="calendar-summary">
          {n === 0
            ? "Nessuna richiesta in questo mese"
            : `${n} ${n === 1 ? "richiesta" : "richieste"} · ${tones.pending} in attesa · ${tones.approved} ${tones.approved === 1 ? "approvata" : "approvate"} · ${tones.closed} ${tones.closed === 1 ? "rifiutata o annullata" : "rifiutate o annullate"}`}
        </p>
      </div>
      <RequestsCalendar days={days} entries={entries} today={today} />
    </section>
  );
}
