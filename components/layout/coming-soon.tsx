import { EmptyState, PageHeader } from "@/components/ui/feedback";

/** Segnaposto per le sezioni delle milestone successive (§15). */
export function ComingSoon({
  eyebrow,
  title,
  milestone,
  children,
}: {
  eyebrow?: string;
  title: string;
  milestone: number;
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} />
      <EmptyState title="Questa sezione è in preparazione.">
        {children}
        <p className="mt-4 eyebrow">Milestone {milestone}</p>
      </EmptyState>
    </>
  );
}
