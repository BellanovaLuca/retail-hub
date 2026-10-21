import { AttachmentList } from "@/components/announcements/attachment-list";
import { Markdown } from "@/components/announcements/markdown";
import { Badge } from "@/components/ui/badge";
import { PersonDot } from "@/components/ui/table";
import type { SignedAttachment } from "@/lib/announcements/storage";
import type { Person } from "@/lib/data/announcements";
import type { PersonRef, ResponsibilityItem } from "@/lib/data/responsibilities";
import { cn } from "@/lib/utils";
import { DayLetters } from "./day-letters";
import { scheduleLabel } from "./format";

/** Responsabilità di una persona, per la panoramica "per persona". */
export function responsibilitiesByPerson(items: ResponsibilityItem[], people: Person[]) {
  return people
    .filter((p) => p.active)
    .map((p) => ({
      person: p,
      owned: items.filter((r) => r.ownerId === p.id),
      supported: items.filter((r) => r.supportIds.includes(p.id)),
    }));
}

/** Nome con pallino; il nome evidenziato (di solito il proprio) è in grassetto con "Tu". */
function Name({
  person,
  highlight,
  viewerId,
}: {
  person: PersonRef;
  highlight: string;
  viewerId: string;
}) {
  const on = person.id === highlight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        on && "rounded-sm bg-foreground px-1.5 py-0.5 font-semibold text-background",
      )}
    >
      {on ? null : <PersonDot color={person.color} />}
      {person.name}
      {on && person.id === viewerId ? <span className="text-[0.625rem] uppercase">· tu</span> : null}
    </span>
  );
}

/**
 * Panoramica unica delle responsabilità (sola lettura): chi si occupa di cosa, per persona e per
 * attività, con il nome evidenziato. Le spunte stanno nella scheda "Spunte".
 */
export function ResponsibilityOverview({
  items,
  people,
  viewerId,
  highlightId,
  attachments,
}: {
  items: ResponsibilityItem[];
  people: Person[];
  viewerId: string;
  /** Persona evidenziata (di solito chi guarda). */
  highlightId: string;
  attachments: Map<string, SignedAttachment>;
}) {
  const rows = responsibilitiesByPerson(items, people);
  // Prima la persona evidenziata, poi chi ha responsabilità, infine chi non ne ha.
  const withWork = rows
    .filter((r) => r.owned.length + r.supported.length > 0)
    .sort((a, b) => Number(b.person.id === highlightId) - Number(a.person.id === highlightId));
  const highlighted = rows.find((r) => r.person.id === highlightId);
  const without = rows.filter((r) => r.owned.length + r.supported.length === 0);
  const allStaff = items.filter((r) => r.allStaff);

  if (items.length === 0) {
    return (
      <p className="py-6 font-display text-xl font-light text-subtle">
        Nessuna responsabilità ancora assegnata.
      </p>
    );
  }

  const nameProps = { highlight: highlightId, viewerId };

  return (
    <div className="flex flex-col gap-14">
      <section aria-labelledby="per-persona">
        <h2 id="per-persona" className="mb-2 eyebrow">
          Per persona
        </h2>
        <p className="mb-5 text-sm text-muted">
          Cerca il tuo nome: accanto trovi le attività di cui sei responsabile (in grassetto) e
          quelle in cui dai supporto.
        </p>
        {highlighted && highlighted.owned.length + highlighted.supported.length === 0 ? (
          <p className="mb-4 text-sm">
            {highlightId === viewerId
              ? "Al momento non hai responsabilità assegnate."
              : `${highlighted.person.displayName} al momento non ha responsabilità assegnate.`}
          </p>
        ) : null}
        <ul className="flex flex-col border-t border-line">
          {withWork.map(({ person, owned, supported }) => {
            const on = person.id === highlightId;
            return (
              <li
                key={person.id}
                id={`persona-${person.id}`}
                className={cn(
                  "grid gap-2 border-b border-line py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6",
                  on && "-mx-3 border-l-4 border-l-foreground bg-foreground/[0.04] pr-3 pl-2",
                )}
              >
                <p className="text-sm">
                  <Name
                    person={{ id: person.id, name: person.displayName, color: person.color }}
                    {...nameProps}
                  />
                </p>
                <div className="flex flex-col gap-1.5 text-sm">
                  {owned.length ? (
                    <p>
                      <span className="mr-2 eyebrow">Responsabile</span>
                      <span className="font-semibold">{owned.map((r) => r.title).join(" · ")}</span>
                    </p>
                  ) : null}
                  {supported.length ? (
                    <p>
                      <span className="mr-2 eyebrow">Supporto</span>
                      {supported.map((r) => r.title).join(" · ")}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {allStaff.length ? (
          <p className="mt-4 text-sm">
            <span className="mr-2 eyebrow">Per tutti</span>
            {allStaff.map((r) => r.title).join(" · ")}
          </p>
        ) : null}
        {without.length ? (
          <p className="mt-3 text-xs text-muted">
            Senza responsabilità: {without.map((r) => r.person.displayName).join(", ")}.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="per-attivita">
        <h2 id="per-attivita" className="mb-2 eyebrow">
          Per attività
        </h2>
        <p className="mb-5 text-sm text-muted">
          Chi se ne occupa, chi dà supporto e in quali giorni. Apri «Come si fa» per le istruzioni.
        </p>
        <div
          aria-hidden
          className="hidden border-b border-line pb-2.5 eyebrow font-semibold sm:grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_9.5rem] sm:gap-4"
        >
          <span>Attività</span>
          <span>Responsabile</span>
          <span>Supporto</span>
          <span className="text-right">Giorni</span>
        </div>
        <ul className="flex flex-col border-t border-line sm:border-t-0">
          {items.map((r) => {
            const mine = r.ownerId === highlightId || r.supportIds.includes(highlightId);
            const hasHowTo = r.descriptionMd.trim() || r.attachments.length > 0;
            return (
              <li
                key={r.id}
                className={cn(
                  "border-b border-line py-4",
                  mine && "-mx-3 border-l-4 border-l-foreground bg-foreground/[0.04] pr-3 pl-2",
                )}
              >
                <div className="grid gap-2 text-sm sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_9.5rem] sm:items-center sm:gap-4">
                  <p className="font-display text-base font-medium tracking-tight">{r.title}</p>
                  <p>
                    <span className="mr-2 eyebrow sm:hidden">Responsabile</span>
                    {r.allStaff ? (
                      <Badge>Tutti</Badge>
                    ) : r.owner ? (
                      <Name person={r.owner} {...nameProps} />
                    ) : (
                      <span className="text-warning">Da assegnare</span>
                    )}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="eyebrow sm:hidden">Supporto</span>
                    {r.supports.length ? (
                      r.supports.map((s) => <Name key={s.id} person={s} {...nameProps} />)
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </p>
                  <p className="flex items-center gap-2 sm:justify-end">
                    <span className="sr-only">Giorni: {scheduleLabel(r.scheduleDays)}</span>
                    <DayLetters days={r.scheduleDays} />
                  </p>
                </div>
                {hasHowTo ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer py-1 text-xs text-muted underline-offset-2 hover:underline">
                      Come si fa
                    </summary>
                    <div className="mt-2 max-w-2xl">
                      <Markdown source={r.descriptionMd} className="text-sm" />
                      <AttachmentList
                        items={r.attachments.map(
                          (a) => attachments.get(a.path) ?? { ...a, url: null },
                        )}
                      />
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
