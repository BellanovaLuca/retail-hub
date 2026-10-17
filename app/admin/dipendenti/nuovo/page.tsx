import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/feedback";
import { nextEmployeeCode } from "@/lib/auth/pin";
import { requireAdmin } from "@/lib/auth/session";
import { getDepartments } from "@/lib/data/people";
import { createClient } from "@/lib/supabase/server";
import { PERSON_COLORS } from "@/lib/validators/employee";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Nuovo dipendente" };

export default async function NuovoDipendentePage() {
  await requireAdmin();
  const supabase = await createClient();
  const [departments, { data: codes }] = await Promise.all([
    getDepartments(supabase),
    supabase.from("profiles").select("employee_code"),
  ]);
  const count = codes?.length ?? 0;

  return (
    <>
      <Link href="/admin/dipendenti" className="link-underline eyebrow">
        ← Dipendenti
      </Link>
      <div className="mt-6">
        <PageHeader title="Nuovo dipendente">
          Alla creazione il sistema genera un PIN provvisorio da mandare alla persona.
        </PageHeader>
      </div>
      <EmployeeForm
        departments={departments}
        defaults={{
          firstName: "",
          lastName: "",
          displayName: "",
          shortLabel: "",
          employeeCode: nextEmployeeCode((codes ?? []).map((c) => c.employee_code)),
          role: "employee",
          weeklyHours: 40,
          homeZone: "vista",
          countsForCoverage: true,
          color: PERSON_COLORS[count % PERSON_COLORS.length],
          departmentIds: [],
          primaryDepartmentId: "",
          email: "",
          phone: "",
          adminNotes: "",
        }}
      />
    </>
  );
}
