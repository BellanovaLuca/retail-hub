import type { Metadata } from "next";
import { AnnouncementEditor } from "@/components/announcements/editor";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPickerData } from "../editor-data";

export const metadata: Metadata = { title: "Nuova comunicazione" };

export default async function NuovaComunicazionePage() {
  await requireAdmin();
  const supabase = await createClient();
  const { departments, people } = await getPickerData(supabase);

  return (
    <>
      <h2 className="mb-8 font-display text-2xl font-light tracking-tight">Nuova comunicazione</h2>
      <AnnouncementEditor
        isNew
        alreadyPublished={false}
        departments={departments}
        people={people}
        initial={{
          id: crypto.randomUUID(),
          title: "",
          body: "",
          category: "generale",
          audience: "all",
          departmentIds: [],
          profileIds: [],
          pinned: false,
          requiresAck: false,
          publishAt: "",
          expiresAt: "",
          attachments: [],
        }}
      />
    </>
  );
}
