import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Registro modifiche" };

export default function Page() {
  return (
    <ComingSoon eyebrow="Audit" title="Registro modifiche" milestone={12}>
      <p>Chi ha modificato cosa, filtrabile per persona e tipo.</p>
    </ComingSoon>
  );
}
