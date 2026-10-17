import type { Metadata } from "next";
import { ResponsibilityEditor } from "@/components/responsibilities/responsibility-editor";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPickerData } from "../../editor-data";

export const metadata: Metadata = { title: "Nuova attività" };

export default async function NuovaResponsabilitaPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { people } = await getPickerData(supabase);
  return (
    <>
      <h2 className="mb-8 font-display text-2xl font-light tracking-tight">Nuova attività</h2>
      <ResponsibilityEditor
        isNew
        people={people}
        initial={{
          id: crypto.randomUUID(),
          title: "",
          description: "",
          scheduleDays: [1, 2, 3, 4, 5, 6, 7],
          active: true,
          allStaff: false,
          ownerId: null,
          supportIds: [],
          attachments: [],
        }}
      />
    </>
  );
}
