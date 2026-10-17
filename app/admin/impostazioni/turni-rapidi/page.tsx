import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TemplatesEditor } from "./templates-editor";

export const metadata: Metadata = { title: "Turni rapidi" };

export default async function TurniRapidiPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shift_templates")
    .select("*")
    .order("sort_order")
    .order("code");
  return (
    <>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        I codici si digitano direttamente nelle celle del foglio turni, come in Excel. Le assenze
        (riposo, ferie, permesso…) non hanno orario.
      </p>
      <TemplatesEditor
        templates={(data ?? []).map((t) => ({
          id: t.id,
          code: t.code,
          label: t.label,
          isAbsence: t.is_absence,
          startTime: t.start_time?.slice(0, 5) ?? null,
          endTime: t.end_time?.slice(0, 5) ?? null,
          breakMinutes: t.break_minutes,
          sortOrder: t.sort_order,
        }))}
      />
    </>
  );
}
