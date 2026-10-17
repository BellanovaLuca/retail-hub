import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Ferie" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Planning" title="Ferie" milestone={6}>
      <p>Il planning ferie del negozio e le tue ferie dell&apos;anno.</p>
    </ComingSoon>
  );
}
