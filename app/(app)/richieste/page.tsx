import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Richieste" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Le mie richieste" title="Richieste" milestone={7}>
      <p>Ferie, permessi, cambi e scambi di turno, con l&apos;approvazione dei responsabili.</p>
    </ComingSoon>
  );
}
