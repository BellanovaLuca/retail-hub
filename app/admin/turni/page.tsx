import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Turni" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Editor" title="Turni" milestone={4}>
      <p>Il foglio turni stile Excel, con la modalità foglio orario.</p>
    </ComingSoon>
  );
}
