import { SubNav } from "@/components/layout/sub-nav";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";

const tabs = [
  { href: "/admin/comunicazioni", label: "Comunicazioni" },
  { href: "/admin/comunicazioni/responsabilita", label: "Responsabilità" },
];

export default async function AdminComunicazioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <>
      <PageHeader eyebrow="Bacheca e responsabilità" title="Comunicazioni" />
      <SubNav items={tabs} exact={["/admin/comunicazioni"]} fallbackHref="/admin/comunicazioni" />
      {children}
    </>
  );
}
