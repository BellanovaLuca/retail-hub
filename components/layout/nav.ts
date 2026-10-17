import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock,
  FileClock,
  Gauge,
  Home,
  Inbox,
  Megaphone,
  MoreHorizontal,
  Palmtree,
  Settings,
  Target,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Voci della tab bar su mobile (§6.1). */
export const employeeTabs: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/orari", label: "Orari", icon: Clock },
  { href: "/obiettivi", label: "Obiettivi", icon: Target },
  { href: "/richieste", label: "Richieste", icon: Inbox },
  { href: "/altro", label: "Altro", icon: MoreHorizontal },
];

/** Voci raccolte sotto "Altro" su mobile. */
export const employeeMore: NavItem[] = [
  { href: "/ferie", label: "Ferie", icon: Palmtree },
  { href: "/comunicazioni", label: "Comunicazioni", icon: Megaphone },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/profilo", label: "Profilo", icon: User },
];

/** Su desktop tutte le voci stanno nella sidebar. */
export const employeeSidebar: NavItem[] = [
  employeeTabs[0],
  employeeTabs[1],
  { href: "/orari/negozio", label: "Griglia negozio", icon: CalendarDays },
  employeeTabs[2],
  employeeTabs[3],
  ...employeeMore,
];

export const adminSidebar: NavItem[] = [
  { href: "/admin", label: "Cruscotto", icon: Gauge },
  { href: "/admin/turni", label: "Turni", icon: CalendarDays },
  { href: "/admin/ferie", label: "Ferie", icon: Palmtree },
  { href: "/admin/richieste", label: "Richieste", icon: Inbox },
  { href: "/admin/comunicazioni", label: "Comunicazioni", icon: Megaphone },
  { href: "/admin/obiettivi", label: "Obiettivi", icon: Target },
  { href: "/admin/performance", label: "Performance", icon: BarChart3 },
  { href: "/admin/dipendenti", label: "Dipendenti", icon: Users },
  { href: "/admin/impostazioni", label: "Impostazioni", icon: Settings },
  { href: "/admin/registro", label: "Registro", icon: FileClock },
];

export const adminEntry: NavItem = {
  href: "/admin",
  label: "Amministrazione",
  icon: ClipboardList,
};

/** Voce attiva: corrispondenza esatta per le radici, per prefisso per il resto. */
export function isActive(pathname: string, href: string, roots: string[] = ["/", "/admin"]) {
  if (roots.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
