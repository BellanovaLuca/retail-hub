"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Schede di secondo livello (es. Impostazioni → Orari), con sottolineatura nera sull'attiva. */
export function SubNav({
  items,
  exact = [],
}: {
  items: { href: string; label: string }[];
  exact?: string[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sezioni" className="-mx-5 mb-10 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-6 border-b border-line">
        {items.map((item) => {
          const active = exact.includes(item.href)
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center border-b-2 text-sm transition-colors",
                  active
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
