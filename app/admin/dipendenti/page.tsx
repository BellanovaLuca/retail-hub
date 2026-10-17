import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Dipendenti" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Persone" title="Dipendenti" milestone={2}>
      <p>Crea i dipendenti, assegna reparti e ore, genera o resetta i PIN.</p>
    </ComingSoon>
  );
}
