import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Impostazioni" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Negozio" title="Impostazioni" milestone={2}>
      <p>Orari di apertura, turni rapidi, festività, regole di pianificazione.</p>
    </ComingSoon>
  );
}
