"use client";

import { useEffect, useState } from "react";

/** Conto alla rovescia all'inizio del turno di oggi (ora di Roma). */
export function Countdown({ date, start }: { date: string; start: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const compute = () => {
      const nowRome = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
      const [h, m] = start.split(":").map(Number);
      const [y, mo, d] = date.split("-").map(Number);
      const target = new Date(y, mo - 1, d, h, m);
      const minutes = Math.round((target.getTime() - nowRome.getTime()) / 60_000);
      if (minutes <= 0) setLabel("In corso");
      else if (minutes < 60) setLabel(`Tra ${minutes} min`);
      else
        setLabel(`Tra ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`);
    };
    compute();
    const t = setInterval(compute, 30_000);
    return () => clearInterval(t);
  }, [date, start]);
  if (!label) return null;
  return (
    <p className="mt-2 text-sm text-muted nums" aria-live="polite">
      {label}
    </p>
  );
}
