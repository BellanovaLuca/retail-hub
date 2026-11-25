"use client";

import { CalendarPlus, Check, Copy, RefreshCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { regenerateCalendarLink } from "@/lib/auth/actions";

/** Feed iCal personale (§6.1): link segreto da aggiungere a Google/Apple Calendar. */
export function CalendarFeed({ token: initialToken }: { token: string }) {
  const [origin, setOrigin] = useState("");
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => setOrigin(window.location.origin), []);

  const httpsUrl = `${origin}/api/ical/${token}.ics`;
  const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");

  function regenerate() {
    setMessage(null);
    startTransition(async () => {
      const result = await regenerateCalendarLink();
      setConfirming(false);
      if (result.ok) {
        setToken(result.token);
        setMessage({
          ok: true,
          text: "Nuovo link creato: aggiungilo di nuovo al calendario. Quello vecchio non funziona più.",
        });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <Card className="mt-12">
      <CardTitle>Aggiungi al calendario</CardTitle>
      <p className="mb-4 max-w-xl text-sm text-muted">
        I tuoi turni pubblicati compaiono da soli nel calendario del telefono e si aggiornano a ogni
        pubblicazione. Il link è personale: non condividerlo.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="secondary">
          <a href={webcalUrl}>
            <CalendarPlus aria-hidden /> Apri nel calendario
          </a>
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(httpsUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Link copiato" : "Copia link (Google Calendar)"}
        </Button>
      </div>

      <div className="mt-6 border-t border-line pt-4">
        {confirming ? (
          <div role="alertdialog" aria-labelledby="rigenera-titolo" className="flex flex-col gap-3">
            <p id="rigenera-titolo" className="max-w-xl text-sm">
              Rigenerare il link? Quello attuale smette subito di funzionare: i calendari che lo
              usano non si aggiorneranno più finché non aggiungi il nuovo.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="sm" onClick={regenerate} disabled={pending}>
                {pending ? "Rigenerazione…" : "Sì, rigenera"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="max-w-xl text-xs text-muted">
              Hai condiviso il link per sbaglio o hai cambiato telefono? Creane uno nuovo: il
              vecchio viene disattivato.
            </p>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                <RefreshCw aria-hidden /> Rigenera link
              </Button>
            </div>
          </div>
        )}
        {message ? (
          <p
            role={message.ok ? "status" : "alert"}
            className={`mt-3 text-sm ${message.ok ? "text-success" : "text-danger"}`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
