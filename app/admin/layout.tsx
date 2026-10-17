import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Amministrazione", template: "%s · Admin" } };

/** Area amministrazione: solo ruolo admin (il controllo vero resta in RLS). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();

  return (
    <AppShell area="admin" isAdmin userName={profile.display_name}>
      {children}
    </AppShell>
  );
}
