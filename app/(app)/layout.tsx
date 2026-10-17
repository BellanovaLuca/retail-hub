import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/session";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <AppShell area="employee" isAdmin={profile.role === "admin"} userName={profile.display_name}>
      {children}
    </AppShell>
  );
}
