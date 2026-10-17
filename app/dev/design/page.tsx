import { Bell, Check } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/layout/wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design" };

const swatches = [
  ["Nero", "bg-foreground", "#0A0A0A"],
  ["Bianco", "bg-background border border-line", "#FFFFFF"],
  ["Superficie", "bg-surface", "#F5F5F4"],
  ["Linea", "bg-line", "#E7E5E4"],
  ["Linea forte", "bg-line-strong", "#A8A29E"],
  ["Testo secondario", "bg-muted", "#57534E"],
] as const;

const informative = [
  ["Avviso / rifiuto", "bg-danger", "#B42318"],
  ["Approvato", "bg-success", "#067647"],
  ["In attesa", "bg-warning", "#B54708"],
  ["Vista", "bg-vista", "#1F3A5F"],
  ["Sole", "bg-sole", "#A87B3D"],
] as const;

/** Guida di stile (§9): visibile solo in sviluppo. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-16">
      <Wordmark className="mb-16 block" />
      <PageHeader eyebrow="Sistema di design" title="Bianco e nero, tipografia protagonista">
        Riferimento per colori, tipografia, pulsanti, celle della griglia e card.
      </PageHeader>

      <Section title="Colori">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map(([name, cls, hex]) => (
            <Swatch key={name} name={name} className={cls} hex={hex} />
          ))}
        </div>
        <p className="mt-10 mb-4 eyebrow">Solo per informare, in piccola quantità</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {informative.map(([name, cls, hex]) => (
            <Swatch key={name} name={name} className={cls} hex={hex} />
          ))}
        </div>
      </Section>

      <Section title="Tipografia">
        <div className="flex flex-col gap-6">
          <p className="font-display text-[2.75rem] leading-[1.1] font-light tracking-tight">
            Titolo di pagina · Inter Tight 300
          </p>
          <p className="font-display text-2xl font-normal">Titolo di sezione · Inter Tight 400</p>
          <p className="eyebrow">Etichetta di sezione · maiuscolo 0.08em</p>
          <p className="max-w-prose leading-relaxed">
            Testo corrente in Inter. Il portale sostituisce file Excel e messaggi per turni, ferie,
            richieste, obiettivi e comunicazioni del negozio di Piazza Cordusio.
          </p>
          <p className="text-lg nums">10:00–14:00 · 16:00–20:00 · 38,5 h · 1.234 €</p>
          <p>
            <a href="#" className="link-underline">
              Link con sottolineatura animata
            </a>
          </p>
        </div>
      </Section>

      <Section title="Pulsanti">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Pubblica</Button>
          <Button variant="secondary">Duplica settimana</Button>
          <Button variant="ghost">Annulla</Button>
          <Button variant="danger">Rifiuta</Button>
          <Button size="icon" variant="secondary" aria-label="Notifiche">
            <Bell />
          </Button>
          <Button disabled>Disattivato</Button>
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          <Badge>Bozza</Badge>
          <Badge tone="solid">Pubblicato</Badge>
          <Badge tone="success">Approvata</Badge>
          <Badge tone="warning">In attesa</Badge>
          <Badge tone="danger">Rifiutata</Badge>
          <Badge tone="vista">Vista</Badge>
          <Badge tone="sole">Sole</Badge>
        </div>
      </Section>

      <Section title="Campi">
        <div className="grid max-w-md gap-2">
          <Label htmlFor="demo">Codice dipendente</Label>
          <Input id="demo" placeholder="CRD-014" />
        </div>
      </Section>

      <Section title="Celle della griglia">
        <GridSample />
      </Section>

      <Section title="Card e stati">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardTitle>Prossimo turno</CardTitle>
            <p className="font-display text-3xl font-light">Domani</p>
            <p className="mt-1 text-lg nums">10:00–20:00</p>
          </Card>
          <Card>
            <CardTitle>Caricamento</CardTitle>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Card>
          <Card>
            <CardTitle>Responsabilità</CardTitle>
            <div className="flex gap-2">
              <CheckBox state="done" />
              <CheckBox state="due" />
              <CheckBox state="missed" />
              <CheckBox state="off" />
            </div>
          </Card>
        </div>
        <EmptyState title="Nessuna comunicazione da leggere." />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-12">
      <h2 className="mb-8 eyebrow">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ name, className, hex }: { name: string; className: string; hex: string }) {
  return (
    <div>
      <div className={cn("aspect-[4/3] rounded-sm", className)} />
      <p className="mt-2 text-sm">{name}</p>
      <p className="text-xs text-muted nums">{hex}</p>
    </div>
  );
}

const people = [
  {
    name: "Francesca",
    zone: "vista",
    cells: ["10–20", "10–20", "R", "10–14 · 16–20", "10–20", "F", "R"],
  },
  {
    name: "Francy",
    zone: "sole",
    cells: ["R", "12–20", "12–20", "12–20", "F?", "10–18", "10:30–20"],
  },
  {
    name: "Fra R.",
    zone: "vista",
    cells: ["10–18", "Assente", "10–18", "R", "12–20", "12–20", "R"],
  },
] as const;

function GridSample() {
  const days = ["Lun 12", "Mar 13", "Mer 14", "Gio 15", "Ven 16", "Sab 17", "Dom 18"];
  const today = 5;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-sm nums">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-3 py-2 text-left eyebrow">Persona</th>
            {days.map((d, i) => (
              <th
                key={d}
                className={cn(
                  "border-b border-line px-3 py-2 text-left eyebrow",
                  i === today && "border-t-[3px] border-t-foreground text-foreground",
                )}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.name}>
              <th
                scope="row"
                className={cn(
                  "sticky left-0 border-b border-l-2 border-line bg-background px-3 py-2.5 text-left font-medium",
                  p.zone === "vista" ? "border-l-vista" : "border-l-sole",
                )}
              >
                {p.name}
              </th>
              {p.cells.map((cell, i) => (
                <td
                  key={i}
                  aria-label={`${p.name}, ${days[i]}: ${cell}`}
                  className={cn(
                    "border-b border-line px-3 py-2.5",
                    i === 1 &&
                      p.name === "Francesca" &&
                      "outline-2 -outline-offset-2 outline-foreground",
                    cell === "R" && "text-subtle",
                    (cell === "F" || cell === "Assente") && "hatch text-line-strong",
                    cell === "F?" && "outline-1 -outline-offset-4 outline-warning outline-dashed",
                  )}
                >
                  <span
                    className={cn(
                      (cell === "F" || cell === "Assente") && "bg-background px-1 text-muted",
                    )}
                  >
                    {cell === "F" ? "Ferie" : cell === "F?" ? "Ferie?" : cell}
                  </span>
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className="sticky left-0 bg-background px-3 py-2 text-left eyebrow">
              Copertura
            </th>
            {days.map((d, i) => (
              <td
                key={d}
                className={cn(
                  "px-3 py-2 text-xs",
                  i === 2 ? "bg-danger/8 text-danger" : "text-muted",
                )}
              >
                {i === 2 ? "Sole 1/2" : "OK"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CheckBox({ state }: { state: "done" | "due" | "missed" | "off" }) {
  return (
    <span
      aria-label={
        { done: "Fatto", due: "Da fare", missed: "Non svolto", off: "Non previsto" }[state]
      }
      className={cn(
        "grid size-11 place-items-center rounded-sm border",
        state === "done" && "border-foreground bg-foreground text-background",
        state === "due" && "border-foreground",
        state === "missed" && "border-danger/40 bg-danger/10",
        state === "off" && "border-line bg-surface",
      )}
    >
      {state === "done" ? <Check className="size-4 stroke-2" aria-hidden /> : null}
    </span>
  );
}
