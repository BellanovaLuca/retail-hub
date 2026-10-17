import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Obiettivi" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Settimana" title="Obiettivi" milestone={9}>
      <p>Compila i numeri del giorno e guarda a quanto sei, quanto ti manca e l&apos;obiettivo.</p>
    </ComingSoon>
  );
}
