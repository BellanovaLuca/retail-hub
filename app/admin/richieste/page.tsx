import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Richieste" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Approvazioni" title="Richieste" milestone={7}>
      <p>Le richieste in attesa con il loro contesto.</p>
    </ComingSoon>
  );
}
