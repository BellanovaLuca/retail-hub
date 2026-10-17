import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Obiettivi individuali" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Settimana" title="Obiettivi individuali" milestone={9}>
      <p>Assegnazione, fogli per persona, monitoraggio e voci.</p>
    </ComingSoon>
  );
}
