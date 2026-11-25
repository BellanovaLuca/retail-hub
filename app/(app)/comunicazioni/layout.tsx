import { SubNav } from "@/components/layout/sub-nav";
import { PageHeader } from "@/components/ui/feedback";

const tabs = [
  { href: "/comunicazioni/responsabilita", label: "Responsabilità" },
  { href: "/comunicazioni/responsabilita/spunte", label: "Spunte" },
  { href: "/comunicazioni", label: "Comunicazioni" },
];

export default function ComunicazioniLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader eyebrow="Negozio" title="Responsabilità e Comunicazioni" />
      <SubNav
        items={tabs}
        exact={["/comunicazioni", "/comunicazioni/responsabilita"]}
        fallbackHref="/comunicazioni"
      />
      {children}
    </>
  );
}
