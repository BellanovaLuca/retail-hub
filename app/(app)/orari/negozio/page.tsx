import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Griglia del negozio" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Orari" title="Griglia del negozio" milestone={4}>
      <p>I turni pubblicati di tutto il negozio, per reparto.</p>
    </ComingSoon>
  );
}
