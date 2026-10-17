import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";
import { getDepartments, primaryDepartmentId } from "@/lib/data/people";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeFootprint } from "@/lib/data/employee-footprint";
import { EmployeeForm } from "../employee-form";
import { AccountActions } from "./account-actions";

export const metadata: Metadata = { title: "Dipendente" };

export default async function DipendentePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: person }, { data: memberships }, departments] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("profile_departments").select("department_id, is_primary").eq("profile_id", id),
    getDepartments(supabase),
  ]);
  if (!person) notFound();

  // Tutto ciò che sparirebbe eliminando l'account (per la finestra di conferma).
  const footprint = await getEmployeeFootprint(supabase, id);

  const member = {
    memberships: (memberships ?? []).map((m) => ({
      departmentId: m.department_id,
      isPrimary: m.is_primary,
    })),
  };

  return (
    <>
      <Link href="/admin/dipendenti" className="link-underline eyebrow">
        ← Dipendenti
      </Link>
      <div className="mt-6">
        <PageHeader eyebrow={person.employee_code} title={person.display_name}>
          <span className="flex flex-wrap gap-2">
            {!person.active ? <Badge tone="danger">Disattivato</Badge> : null}
            {person.must_change_pin && person.active ? (
              <Badge tone="warning">PIN provvisorio da cambiare</Badge>
            ) : null}
            {person.role === "admin" ? <Badge tone="solid">Amministratore</Badge> : null}
          </span>
        </PageHeader>
      </div>
      <EmployeeForm
        employeeId={person.id}
        departments={departments}
        defaults={{
          firstName: person.first_name,
          lastName: person.last_name,
          displayName: person.display_name,
          shortLabel: person.short_label ?? "",
          employeeCode: person.employee_code,
          role: person.role,
          weeklyHours: person.weekly_hours,
          homeZone: person.home_zone,
          countsForCoverage: person.counts_for_coverage,
          color: person.color,
          departmentIds: member.memberships.map((m) => m.departmentId),
          primaryDepartmentId: primaryDepartmentId(member) ?? "",
          email: person.email ?? "",
          phone: person.phone ?? "",
          adminNotes: person.admin_notes ?? "",
        }}
      />
      <AccountActions
        id={person.id}
        name={person.display_name}
        active={person.active}
        isSelf={person.id === me.id}
        footprint={footprint}
      />
    </>
  );
}
