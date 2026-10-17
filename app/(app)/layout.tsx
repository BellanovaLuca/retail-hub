import { AppShell } from "@/components/layout/app-shell";
import { getBrandLogo } from "@/lib/branding";
import { requireProfile } from "@/lib/auth/session";
import { unreadNotificationsCount } from "@/lib/notifications/actions";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <AppShell
      area="employee"
      isAdmin={profile.role === "admin"}
      userName={profile.display_name}
      profileId={profile.id}
      unreadCount={await unreadNotificationsCount()}
      logo={await getBrandLogo()}
    >
      {children}
    </AppShell>
  );
}
