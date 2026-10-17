import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { FileSpreadsheet } from "lucide-react";
import { redirect } from "next/navigation";
import { SubNav } from "@/components/layout/sub-nav";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeWeekParam } from "@/lib/data/schedule";
import { nowInRome, weekNumber } from "@/lib/dates";
import { WeekNav } from "./week-nav";

export default async function ObiettiviWeekLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ week: string }>;
}) {
  await requireAdmin();
  const { week: param } = await params;
  const weekStart = normalizeWeekParam(param, nowInRome());
  if (weekStart !== param) redirect(`/admin/obiettivi/${weekStart}`);
  const sunday = addDays(parseISO(weekStart), 6);
  const base = `/admin/obiettivi/${weekStart}`;

  return (
    <>
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 eyebrow">Obiettivi individuali</p>
          <WeekNav weekStart={weekStart} weekNumber={weekNumber(parseISO(weekStart))} />
          <p className="mt-2 text-sm text-muted nums">
            {format(parseISO(weekStart), "d MMM", { locale: it })} –{" "}
            {format(sunday, "d MMM yyyy", { locale: it })}
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/export/obiettivi/${weekStart}`}>
            <FileSpreadsheet aria-hidden /> Esporta Excel
          </a>
        </Button>
      </header>
      <SubNav
        items={[
          { href: base, label: "Assegnazione" },
          { href: `${base}/persone`, label: "Persone" },
          { href: `${base}/monitoraggio`, label: "Monitoraggio" },
          { href: `${base}/voci`, label: "Voci" },
        ]}
        exact={[base]}
      />
      {children}
    </>
  );
}
