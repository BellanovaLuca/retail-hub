import { AttachmentList } from "@/components/announcements/attachment-list";
import { Markdown } from "@/components/announcements/markdown";
import { Badge } from "@/components/ui/badge";
import type { SignedAttachment } from "@/lib/announcements/storage";
import type { ResponsibilityItem } from "@/lib/data/responsibilities";
import { cn } from "@/lib/utils";
import { DayLetters } from "./day-letters";
import { scheduleLabel } from "./format";

/**
 * Le responsabilità di una persona: quelle di cui è responsabile (evidenziate) e quelle in cui è
 * di supporto, con i giorni previsti e "come si fa".
 */
export function ResponsibilityCards({
  personId,
  items,
  attachments,
}: {
  personId: string;
  items: ResponsibilityItem[];
  attachments: Map<string, SignedAttachment>;
}) {
  const owned = items.filter((r) => r.ownerId === personId);
  const supported = items.filter((r) => r.supportIds.includes(personId));
  const allStaff = items.filter((r) => r.allStaff);

  const card = (r: ResponsibilityItem, role: "owner" | "support" | "all") => (
    <li
      key={r.id}
      className={cn(
        "rounded-lg border p-5",
        role === "owner" ? "border-l-4 border-foreground" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex flex-wrap items-center gap-2">
            {role === "owner" ? (
              <Badge tone="solid">Responsabile</Badge>
            ) : role === "support" ? (
              <Badge>Supporto</Badge>
            ) : (
              <Badge>Tutti</Badge>
            )}
          </p>
          <h3
            className={cn(
              "font-display text-lg tracking-tight",
              role === "owner" ? "font-semibold" : "font-normal",
            )}
          >
            {r.title}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {role === "support" && r.owner ? (
              <>
                Responsabile:{" "}
                <strong className="font-semibold text-foreground">{r.owner.name}</strong>
                {" · "}
              </>
            ) : null}
            {role === "owner" && r.supports.length > 0
              ? `Supporto: ${r.supports.map((s) => s.name).join(", ")} · `
              : null}
            {scheduleLabel(r.scheduleDays)}
          </p>
        </div>
        <DayLetters days={r.scheduleDays} />
      </div>
      {r.descriptionMd.trim() || r.attachments.length > 0 ? (
        <details className="group mt-4" open={role === "owner" && items.length <= 3}>
          <summary className="cursor-pointer py-1 eyebrow">Come si fa</summary>
          <div className="mt-3">
            <Markdown source={r.descriptionMd} className="text-sm" />
            <AttachmentList
              items={r.attachments.map((a) => attachments.get(a.path) ?? { ...a, url: null })}
            />
          </div>
        </details>
      ) : null}
    </li>
  );

  if (owned.length + supported.length === 0) {
    return (
      <div>
        <p className="py-4 font-display text-xl font-light text-subtle">
          Nessuna responsabilità assegnata.
        </p>
        {allStaff.length > 0 ? (
          <ul className="mt-2 grid gap-4 md:grid-cols-2">{allStaff.map((r) => card(r, "all"))}</ul>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {owned.map((r) => card(r, "owner"))}
      {supported.map((r) => card(r, "support"))}
      {allStaff.map((r) => card(r, "all"))}
    </ul>
  );
}
