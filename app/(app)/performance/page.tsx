import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Performance" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Annuale" title="Performance" milestone={10}>
      <p>I tuoi 3 obiettivi Achievement e 3 Leadership, con i commenti.</p>
    </ComingSoon>
  );
}
