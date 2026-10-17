"use client";

import { Home, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "@/components/notifications/bell";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import {
  adminEntry,
  adminSidebar,
  employeeMore,
  employeeSidebar,
  employeeTabs,
  isActive,
  type NavItem,
} from "./nav";
import { Wordmark } from "./wordmark";

type ShellProps = {
  /** Area dipendente (tab bar su mobile) o amministrazione (desktop-first). */
  area: "employee" | "admin";
  isAdmin: boolean;
  userName: string;
  profileId: string;
  unreadCount: number;
  children: React.ReactNode;
};

const personalArea: NavItem = { href: "/", label: "Area personale", icon: Home };

/** Svuota la copia offline delle pagine (dati personali) quando si esce. */
function clearOfflineCopy() {
  navigator.serviceWorker?.controller?.postMessage("logout");
}

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="bg-foreground px-5 py-2 text-center text-xs text-background">
      Sei offline: stai vedendo l&apos;ultima versione salvata.
    </div>
  );
}

export function AppShell({
  area,
  isAdmin,
  userName,
  profileId,
  unreadCount,
  children,
}: ShellProps) {
  const pathname = usePathname();
  useEffect(() => {
    // Il service worker serve per le notifiche push e per la copia offline degli orari.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);
  const sidebar = area === "admin" ? adminSidebar : employeeSidebar;
  const tabs = area === "employee" ? employeeTabs : undefined;
  const moreHrefs = employeeMore.map((item) => item.href);
  const footerLink = area === "admin" ? personalArea : isAdmin ? adminEntry : undefined;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line px-5 py-8 md:flex">
        <div className="mb-12 flex items-start justify-between gap-2">
          <Link href="/" className="block">
            <Wordmark />
          </Link>
          <NotificationBell
            profileId={profileId}
            initialCount={unreadCount}
            className="-mt-3 -mr-3"
          />
        </div>
        <nav aria-label="Principale" className="flex flex-1 flex-col gap-0.5">
          {sidebar.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-line pt-4">
          {footerLink ? <SidebarLink item={footerLink} active={false} /> : null}
          <div className="flex items-center justify-between gap-2 pl-3">
            <p className="truncate text-sm text-muted">{userName}</p>
            <NotificationBell profileId={profileId} initialCount={unreadCount} />
          </div>
          <form action={signOut} onSubmit={clearOfflineCopy}>
            <button
              type="submit"
              className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <LogOut className="size-4 stroke-[1.5]" aria-hidden /> Esci
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-line px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 md:hidden">
          <Link href="/">
            <Wordmark />
          </Link>
          <span className="flex items-center gap-3">
            {footerLink ? (
              <Link href={footerLink.href} className="link-underline eyebrow">
                {footerLink.label}
              </Link>
            ) : null}
            <NotificationBell profileId={profileId} initialCount={unreadCount} className="-mr-3" />
          </span>
        </header>
        <OfflineBanner />
        <main
          className={cn(
            "mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 md:px-12 md:py-14",
            tabs && "pb-28 md:pb-14",
          )}
        >
          {children}
        </main>
      </div>

      {tabs ? <TabBar tabs={tabs} moreHrefs={moreHrefs} pathname={pathname} /> : null}
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
        active
          ? "font-medium text-foreground"
          : "text-muted hover:bg-surface hover:text-foreground",
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-0 w-0.5 bg-foreground" aria-hidden />
      ) : null}
      <Icon className="size-4 stroke-[1.5]" aria-hidden />
      {item.label}
    </Link>
  );
}

function TabBar({
  tabs,
  moreHrefs,
  pathname,
}: {
  tabs: NavItem[];
  moreHrefs: string[];
  pathname: string;
}) {
  const activeIndex = tabs.findIndex((tab) =>
    tab.href === "/altro"
      ? isActive(pathname, tab.href) || moreHrefs.some((href) => isActive(pathname, href))
      : isActive(pathname, tab.href),
  );

  return (
    <nav
      aria-label="Principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {activeIndex >= 0 ? (
          <span
            aria-hidden
            className="absolute top-0 h-0.5 bg-foreground transition-transform duration-200 ease-out"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
        ) : null}
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const active = i === activeIndex;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[0.625rem] tracking-[0.08em] uppercase transition-colors",
                active ? "text-foreground" : "text-subtle",
              )}
            >
              <Icon className="size-5 stroke-[1.5]" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
