import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { pinRequirement } from "@/lib/auth/pin";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, themeSchema } from "@/lib/theme";
import { parsePrefs } from "@/lib/delivery";
import { NotificationSettings } from "./notification-settings";
import { ChangePinForm, SessionActions, ThemePicker } from "./profile-forms";

export const metadata: Metadata = { title: "Profilo" };

const zoneLabel = { vista: "Vista", sole: "Sole", jolly: "Jolly" } as const;

export default async function ProfiloPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: memberships }, { data: departments }] = await Promise.all([
    supabase
      .from("profile_departments")
      .select("department_id, is_primary")
      .eq("profile_id", profile.id),
    supabase.from("departments").select("id, name"),
  ]);
  const theme = themeSchema.catch("sistema").parse((await cookies()).get(THEME_COOKIE)?.value);

  const nameById = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const departmentNames = (memberships ?? [])
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((m) => nameById.get(m.department_id))
    .filter(Boolean)
    .join(" · ");

  const rows: [string, string][] = [
    ["Nome", `${profile.first_name} ${profile.last_name}`],
    ["Nome visualizzato", profile.display_name],
    ["Codice dipendente", profile.employee_code],
    ["Reparti", departmentNames || "—"],
    ["Area", zoneLabel[profile.home_zone]],
    ["Ore settimanali", profile.weekly_hours != null ? `${profile.weekly_hours} h` : "—"],
  ];

  return (
    <>
      <PageHeader eyebrow="Profilo" title={profile.display_name} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>I miei dati</CardTitle>
          <dl className="divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">
            Per correggere questi dati rivolgiti a un responsabile.
          </p>
        </Card>

        <Card>
          <CardTitle>Cambia PIN</CardTitle>
          <ChangePinForm pinHint={pinRequirement(profile.role)} />
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Notifiche</CardTitle>
          <NotificationSettings
            vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null}
            initial={{
              ...parsePrefs(profile.notification_prefs),
              emailAddress: profile.email ?? "",
              phone: profile.phone ?? "",
            }}
          />
        </Card>

        <Card>
          <CardTitle>Tema</CardTitle>
          <ThemePicker current={theme} />
        </Card>

        <Card>
          <CardTitle>Sessione</CardTitle>
          <SessionActions />
        </Card>
      </div>
    </>
  );
}
