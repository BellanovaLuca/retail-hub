"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { EmployeeFootprint } from "@/lib/data/employee-footprint";
import { sameName } from "@/lib/employees/confirm";
import { deleteEmployee } from "../actions";

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Righe "cosa verrà eliminato", solo per ciò che esiste davvero. */
function footprintLines(f: EmployeeFootprint): string[] {
  const lines: (string | null)[] = [
    f.shifts
      ? `${n(f.shifts, "turno", "turni")} nel foglio turni${
          f.publishedWeeks
            ? `, compresi quelli di ${n(f.publishedWeeks, "settimana già pubblicata", "settimane già pubblicate")}: spariranno anche dagli orari che vedono i colleghi`
            : ""
        }`
      : null,
    f.leaves ? `${n(f.leaves, "giorno", "giorni")} di ferie o assenze nel planning` : null,
    f.requests
      ? `${n(f.requests, "sua richiesta", "sue richieste")} (ferie, permessi, cambi…)`
      : null,
    f.swapsProposedToHer
      ? `${n(f.swapsProposedToHer, "scambio di turno che un collega le ha proposto", "scambi di turno che i colleghi le hanno proposto")}`
      : null,
    f.dailyEntries
      ? `${n(f.dailyEntries, "numero inserito", "numeri inseriti")} negli obiettivi giornalieri: i totali del negozio di quelle settimane scenderanno`
      : null,
    f.weeklyTargets
      ? `${n(f.weeklyTargets, "obiettivo settimanale assegnato", "obiettivi settimanali assegnati")}`
      : null,
    f.weeklyComments ? `${n(f.weeklyComments, "commento", "commenti")} sugli obiettivi` : null,
    f.performanceGoals
      ? `${n(f.performanceGoals, "obiettivo", "obiettivi")} di performance annuale`
      : null,
    f.extraTasks
      ? `${n(f.extraTasks, "attività extra assegnata", "attività extra assegnate")}`
      : null,
  ];
  return lines.filter((l): l is string => Boolean(l));
}

export function DeleteEmployeeDialog({
  id,
  name,
  footprint,
}: {
  id: string;
  name: string;
  footprint: EmployeeFootprint;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const lines = footprintLines(footprint);
  const hasHistory = footprint.everLoggedIn || lines.length > 0;
  const confirmed = sameName(typed, name);

  function onDelete() {
    if (!confirmed) return;
    setResult(null);
    startTransition(async () => {
      const res = await deleteEmployee(id, typed);
      if (res.ok) {
        setOpen(false);
        router.replace(`/admin/dipendenti?eliminato=${encodeURIComponent(name)}`);
        router.refresh();
      } else {
        setResult(res);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Mentre si elimina la finestra non si chiude.
        if (pending) return;
        setOpen(o);
        if (o) {
          setTyped("");
          setResult(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-danger">
          <Trash2 aria-hidden /> Elimina account
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Eliminare ${name}?`}
        description="L'eliminazione è definitiva: non si può annullare e i dati non si recuperano."
      >
        <div className="flex flex-col gap-6 text-sm">
          <section
            role="alert"
            className="flex gap-3 rounded-md border border-danger/40 p-4 text-foreground"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <div className="flex flex-col gap-2">
              <p className="font-medium">
                Insieme all&apos;account verrà eliminato tutto quello che la riguarda.
              </p>
              <p className="text-muted">
                {name} non potrà più accedere e il suo codice smetterà di funzionare.
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 eyebrow">Cosa verrà eliminato</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>profilo, codice di accesso e PIN</li>
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
              <li>
                notifiche, preferenze, letture delle comunicazioni e iscrizioni alle notifiche push
              </li>
            </ul>
          </section>

          {footprint.ownedResponsibilities.length || footprint.supportedResponsibilities.length ? (
            <section>
              <h3 className="mb-2 eyebrow">Responsabilità</h3>
              {footprint.ownedResponsibilities.length ? (
                <p>
                  Resteranno <strong className="font-medium">senza responsabile</strong>:{" "}
                  {footprint.ownedResponsibilities.join(", ")}. Dopo l&apos;eliminazione assegnale a
                  qualcun altro da Comunicazioni → Responsabilità.
                </p>
              ) : null}
              {footprint.supportedResponsibilities.length ? (
                <p className="mt-1.5 text-muted">
                  Non sarà più di supporto in: {footprint.supportedResponsibilities.join(", ")}.
                </p>
              ) : null}
            </section>
          ) : null}

          <p className="text-muted">
            Restano invece le comunicazioni e i commenti scritti da altri, e il registro modifiche
            (dove l&apos;eliminazione verrà annotata a tuo nome).
          </p>

          {hasHistory ? (
            <p className="border-l-2 border-foreground pl-3">
              {footprint.everLoggedIn ? `${name} ha già usato il portale. ` : ""}
              Se ha lavorato in negozio è meglio{" "}
              <strong className="font-medium">Disattiva account</strong>: non potrà più accedere, ma
              turni, ferie e numeri restano nello storico e nei totali.
            </p>
          ) : (
            <p className="text-muted">
              {name} non ha ancora usato il portale e non ha dati collegati: l&apos;eliminazione non
              tocca nient&apos;altro.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="confirm-name" className="text-sm">
              Per confermare scrivi il nome <strong className="font-medium">{name}</strong>
            </label>
            <Input
              id="confirm-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
          </div>

          <FormMessage result={result} />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Annulla
              </Button>
            </DialogClose>
            <Button variant="danger" onClick={onDelete} disabled={!confirmed || pending}>
              <Trash2 aria-hidden />
              {pending ? "Eliminazione in corso…" : "Elimina definitivamente"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
