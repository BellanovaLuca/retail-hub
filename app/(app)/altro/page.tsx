import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { employeeMore } from "@/components/layout/nav";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Altro" };

export default function AltroPage() {
  return (
    <>
      <PageHeader title="Altro" />
      <ul className="border-t border-line">
        {employeeMore.map(({ href, label, icon: Icon }) => (
          <li key={href} className="border-b border-line">
            <Link href={href} className="flex min-h-16 items-center gap-4 text-lg">
              <Icon className="size-5 stroke-[1.5]" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 stroke-[1.5] text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
