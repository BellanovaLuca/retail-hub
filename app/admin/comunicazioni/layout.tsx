import { SubNav } from "@/components/layout/sub-nav";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";

const tabs = [
  { href: "/admin/comunicazioni/responsabilita", label: "Responsabilità" },
  { href: "/admin/comunicazioni", label: "Comunicazioni" },
];

export default async function AdminComunicazioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <>
      <PageHeader eyebrow="Negozio" title="Responsabilità e Comunicazioni" />
      <SubNav items={tabs} exact={["/admin/comunicazioni"]} fallbackHref="/admin/comunicazioni" />
      {children}
    </>
  );
}
