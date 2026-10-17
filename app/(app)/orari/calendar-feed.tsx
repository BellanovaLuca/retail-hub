"use client";

import { CalendarPlus, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

/** Feed iCal personale (§6.1): link segreto da aggiungere a Google/Apple Calendar. */
export function CalendarFeed({ token }: { token: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const httpsUrl = `${origin}/api/ical/${token}.ics`;
  const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");

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
    </Card>
  );
}
