import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Regole di pianificazione" };

export default function RegolePage() {
  return (
    <EmptyState title="Le regole di copertura arrivano con la milestone 5.">
      <p>Set di regole, variabili e anteprima delle violazioni sulla settimana in corso.</p>
    </EmptyState>
  );
}
