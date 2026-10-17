import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Planning ferie" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Ferie" title="Planning ferie" milestone={6}>
      <p>Il foglio ferie annuale: calendario e persone × giorni.</p>
    </ComingSoon>
  );
}
