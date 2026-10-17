import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Comunicazioni" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Bacheca" title="Comunicazioni" milestone={8}>
      <p>Comunicazioni, conferme di lettura e responsabilità.</p>
    </ComingSoon>
  );
}
