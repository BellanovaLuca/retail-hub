import { SubNav } from "@/components/layout/sub-nav";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";

const sections = [
  { href: "/admin/impostazioni", label: "Negozio" },
  { href: "/admin/impostazioni/orari", label: "Orari di apertura" },
  { href: "/admin/impostazioni/turni-rapidi", label: "Turni rapidi" },
  { href: "/admin/impostazioni/festivita", label: "Festività e chiusure" },
  { href: "/admin/impostazioni/regole", label: "Regole di pianificazione" },
];

export default async function ImpostazioniLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <PageHeader eyebrow="Negozio" title="Impostazioni" />
      <SubNav items={sections} exact={["/admin/impostazioni"]} />
      {children}
    </>
  );
}
