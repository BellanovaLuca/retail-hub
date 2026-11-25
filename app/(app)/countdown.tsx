"use client";

import { useEffect, useState } from "react";
import { countdownLabel, romeClock, type ShiftPiece } from "./countdown-label";

/**
 * Conto alla rovescia del turno di oggi (ora di Roma). `pieces` = tutti i pezzi del turno
 * (più di uno se è spezzato): durante la pausa mostra quanto manca alla ripresa.
 */
export function Countdown({ date, pieces }: { date: string; pieces: ShiftPiece[] }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const compute = () => {
      const now = romeClock(new Date());
      // Pagina rimasta aperta oltre la mezzanotte: il turno non è più "di oggi".
      setLabel(now.date === date ? countdownLabel(pieces, now.minutes) : null);
    };
    compute();
    const t = setInterval(compute, 30_000);
    return () => clearInterval(t);
  }, [date, pieces]);
  if (!label) return null;
  return (
    <p className="mt-2 text-sm text-muted nums" aria-live="polite">
      {label}
    </p>
  );
}
