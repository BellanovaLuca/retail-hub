import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/auth/session";
import { getDepartments, getStaff, primaryDepartmentId } from "@/lib/data/people";
import { createClient } from "@/lib/supabase/server";
import { StaffList } from "./staff-list";

export const metadata: Metadata = { title: "Dipendenti" };

export default async function DipendentiPage({
  searchParams,
}: {
  searchParams: Promise<{ disattivati?: string; eliminato?: string }>;
}) {
  await requireAdmin();
  const { disattivati, eliminato } = await searchParams;
  const supabase = await createClient();
  const [staff, departments] = await Promise.all([
    getStaff(supabase, { includeInactive: true }),
    getDepartments(supabase),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  const rows = staff.map((p) => {
    const primary = primaryDepartmentId(p);
    return {
      id: p.id,
      displayName: p.display_name,
      fullName: `${p.first_name} ${p.last_name}`,
      code: p.employee_code,
      color: p.color,
      role: p.role,
      zone: p.home_zone,
      weeklyHours: p.weekly_hours,
      active: p.active,
      mustChangePin: p.must_change_pin,
      primaryDepartment: primary ? (deptName.get(primary) ?? "") : "",
      otherDepartments: p.memberships
        .filter((m) => m.departmentId !== primary)
        .map((m) => deptName.get(m.departmentId) ?? ""),
    };
  });
  const active = rows.filter((r) => r.active);
  const inactive = rows.filter((r) => !r.active);
  const totalHours = active.reduce((sum, r) => sum + (r.weeklyHours ?? 0), 0);

  return (
    <>
      <PageHeader eyebrow="Persone" title="Dipendenti">
        <p className="nums">
          {active.length} persone attive · {totalHours.toLocaleString("it-IT")} ore di contratto a
          settimana
        </p>
      </PageHeader>
      {eliminato ? (
        <p role="status" className="mb-8 border-l-2 border-foreground pl-3 text-sm">
          {eliminato.slice(0, 60)} è stata eliminata con tutti i suoi dati.
        </p>
      ) : null}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          L&apos;ordine dell&apos;elenco è quello delle righe nella griglia turni: trascina o usa le
          frecce per cambiarlo.
        </p>
        <Button asChild>
          <Link href="/admin/dipendenti/nuovo">
            <Plus aria-hidden /> Nuovo dipendente
          </Link>
        </Button>
      </div>
      <StaffList rows={active} sortable />
      {inactive.length > 0 ? (
        <details className="mt-14" open={disattivati === "1"}>
          <summary className="cursor-pointer py-2 eyebrow">
            Account disattivati ({inactive.length})
          </summary>
          <div className="mt-4">
            <StaffList rows={inactive} />
          </div>
        </details>
      ) : null}
    </>
  );
}
