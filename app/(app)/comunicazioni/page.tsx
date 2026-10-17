import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Comunicazioni" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Bacheca" title="Comunicazioni" milestone={8}>
      <p>La bacheca del negozio e le responsabilità di ciascuno.</p>
    </ComingSoon>
  );
}
