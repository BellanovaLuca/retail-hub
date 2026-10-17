import { formatInRome } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABELS,
  WEEKDAY_NAMES,
  formatRange,
  requestTypeLabel,
  statusTone,
  type RequestStatus,
} from "@/lib/requests";
import type { RequestDetail } from "@/lib/data/requests";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const s = status as RequestStatus;
  return <Badge tone={statusTone(s)}>{STATUS_LABELS[s] ?? status}</Badge>;
}

/** Riassunto leggibile della richiesta: tipo, date, orari, ore, giorni ricorrenti. */
export function requestSummary(r: {
  type: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number | null;
  recurring_weekdays: number[] | null;
}) {
  const parts = [formatRange(r.start_date, r.end_date)];
  if (r.start_time && r.end_time)
    parts.push(`${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`);
  if (r.hours) parts.push(`${String(r.hours).replace(".", ",")} ore`);
  if (r.recurring_weekdays?.length)
    parts.push(`ogni ${r.recurring_weekdays.map((d) => WEEKDAY_NAMES[d - 1]).join(", ")}`);
  return { title: requestTypeLabel(r.type), detail: parts.join(" · ") };
}

const when = (iso: string) => formatInRome(iso, "d MMM, HH:mm");

export function RequestTimeline({ r }: { r: RequestDetail }) {
  const items: { label: string; at?: string | null; tone?: "success" | "danger" }[] = [
    { label: `Inviata da ${r.requesterName}`, at: r.created_at },
  ];
  if (r.type === "scambio_turno") {
    if (r.status === "peer_declined")
      items.push({ label: `${r.targetName} ha rifiutato lo scambio`, tone: "danger" });
    else if (
      ["peer_accepted", "approved"].includes(r.status) ||
      (r.status === "rejected" && r.decided_at)
    )
      items.push({ label: `${r.targetName} ha accettato lo scambio`, tone: "success" });
    else if (r.status === "pending")
      items.push({ label: `In attesa della risposta di ${r.targetName}` });
  }
  if (r.status === "approved")
    items.push({
      label: `Approvata da ${r.deciderName ?? "un responsabile"}`,
      at: r.decided_at,
      tone: "success",
    });
  if (r.status === "rejected")
    items.push({
      label: `Rifiutata da ${r.deciderName ?? "un responsabile"}`,
      at: r.decided_at,
      tone: "danger",
    });
  if (r.status === "cancelled") items.push({ label: "Annullata", at: r.updated_at });
  if (r.status === "pending" && r.type !== "scambio_turno")
    items.push({ label: "In attesa di un responsabile" });
  if (r.status === "peer_accepted") items.push({ label: "In attesa di un responsabile" });

  return (
    <ol className="relative flex flex-col gap-5 border-l border-line pl-5">
      {items.map((item, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute top-1.5 -left-[1.4rem] size-2 rounded-full",
              item.tone === "success"
                ? "bg-success"
                : item.tone === "danger"
                  ? "bg-danger"
                  : item.at
                    ? "bg-foreground"
                    : "border border-line-strong bg-background",
            )}
          />
          <p className="text-sm">{item.label}</p>
          {item.at ? <p className="text-xs text-muted nums">{when(item.at)}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function CommentList({ comments, me }: { comments: RequestDetail["comments"]; me: string }) {
  if (comments.length === 0) return <p className="text-sm text-muted">Nessun commento.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {comments.map((c) => (
        <li
          key={c.id}
          className={cn(
            "max-w-[85%] rounded-md border border-line p-3",
            c.authorId === me && "ml-auto bg-surface",
          )}
        >
          <p className="mb-1 text-xs text-muted">
            {c.authorName} · <span className="nums">{when(c.createdAt)}</span>
          </p>
          <p className="text-sm whitespace-pre-wrap">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
