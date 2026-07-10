import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  Wallet,
  UploadCloud,
  Bell,
  MailPlus,
  ScrollText,
  BarChart3,
  TrendingUp,
} from "lucide-react";

/*
  Single source of truth for the app's navigable screens, grouped by
  workflow — used by the sidebar (Nav.tsx), the top bar's breadcrumb, and
  the command palette (Cmd/Ctrl+K). Home ("/") and Sign In aren't listed —
  Home is just a redirect shim to Dashboard and Sign In isn't a meaningful
  destination once signed in. Each unbuilt screen shows a "build me" tag in
  the sidebar and is skipped by the command palette. When you finish a
  screen, flip its `built` to true (and point `href` at the route you
  created) so it turns into a real link everywhere.
*/
export type NavLink = { href: string; label: string; built: boolean; icon: typeof LayoutDashboard };

export const NAV_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Overview",
    links: [{ href: "/dashboard", label: "Dashboard", built: true, icon: LayoutDashboard }],
  },
  {
    title: "Masters",
    links: [
      { href: "/masters/customers", label: "Customer Master", built: true, icon: Users },
      { href: "/masters/gl", label: "GL Master", built: true, icon: BookOpen },
    ],
  },
  {
    title: "Transactions",
    links: [
      { href: "/invoices", label: "Sales Invoices", built: true, icon: FileText },
      { href: "/receipts", label: "Receipt Entry", built: true, icon: Wallet },
      { href: "/upload", label: "Upload Report", built: true, icon: UploadCloud },
    ],
  },
  {
    title: "Collections",
    links: [
      { href: "/reminders", label: "AR Followup", built: true, icon: Bell },
      { href: "/reminder-template", label: "Reminder Template", built: true, icon: MailPlus },
    ],
  },
  {
    title: "Reports",
    links: [
      { href: "/reports/statement", label: "Customer Statement", built: true, icon: ScrollText },
      { href: "/reports/ageing", label: "AR Ageing", built: true, icon: BarChart3 },
      { href: "/cashflow", label: "Cashflow Projection", built: true, icon: TrendingUp },
    ],
  },
];

/** Flat list of every built link, each tagged with its group title. */
export const NAV_LINKS: (NavLink & { group: string })[] = NAV_GROUPS.flatMap((group) =>
  group.links.map((link) => ({ ...link, group: group.title }))
);

/** Finds the group + link matching a pathname, for breadcrumbs. Longest href match wins. */
export function findNavEntry(pathname: string): { group: string; link: NavLink } | null {
  let best: { group: string; link: NavLink } | null = null;
  for (const group of NAV_GROUPS) {
    for (const link of group.links) {
      if (pathname === link.href || pathname.startsWith(`${link.href}/`)) {
        if (!best || link.href.length > best.link.href.length) {
          best = { group: group.title, link };
        }
      }
    }
  }
  return best;
}
