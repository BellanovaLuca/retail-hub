import "server-only";
import { createClient } from "@/lib/supabase/server";

export type BrandLogo = { url: string; name: string };

/**
 * Logo caricato dall'admin (Impostazioni → Logo), come URL firmato valido un'ora.
 * Null finché non c'è: l'intestazione mostra il wordmark testuale (§9).
 */
export async function getBrandLogo(): Promise<BrandLogo | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("store_settings")
      .select("logo_path, store_name")
      .eq("id", true)
      .maybeSingle();
    if (!data?.logo_path) return null;
    const { data: signed } = await supabase.storage
      .from("branding")
      .createSignedUrl(data.logo_path, 3600);
    return signed?.signedUrl ? { url: signed.signedUrl, name: data.store_name } : null;
  } catch {
    return null;
  }
}
