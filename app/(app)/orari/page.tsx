import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "I miei orari" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Orari" title="I miei orari" milestone={4}>
      <p>Settimana e mese, ore totali, feed per il calendario del telefono.</p>
    </ComingSoon>
  );
}
