import type { Metadata } from "next";
import { getDepartments } from "@/lib/data/people";
import { createClient } from "@/lib/supabase/server";
import { LogoForm, StoreForm } from "./store-forms";

export const metadata: Metadata = { title: "Impostazioni" };

export default async function ImpostazioniNegozioPage() {
  const supabase = await createClient();
  const [{ data: settings }, departments] = await Promise.all([
    supabase.from("store_settings").select("*").eq("id", true).single(),
    getDepartments(supabase),
  ]);
  if (!settings) return null;

  let logoUrl: string | null = null;
  if (settings.logo_path) {
    const { data } = await supabase.storage
      .from("branding")
      .createSignedUrl(settings.logo_path, 3600);
    logoUrl = data?.signedUrl ?? null;
  }
  const thresholds = (settings.leave_thresholds ?? {}) as Record<string, number>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <StoreForm
        defaults={{
          storeName: settings.store_name,
          requestNoticeDays: settings.request_notice_days,
          shareIndividualMonitoring: settings.share_individual_monitoring,
          leaveThresholds: Object.fromEntries(
            departments.map((d) => [d.id, thresholds[d.id] ?? null]),
          ),
        }}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      />
      <LogoForm logoUrl={logoUrl} />
    </div>
  );
}
