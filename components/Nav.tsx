"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LogOut,
} from "lucide-react";
import { signOut } from "@/lib/auth";

/*
  Left sidebar, grouped by workflow. Home ("/") and Sign In aren't listed here —
  Home is just a redirect shim to Dashboard and Sign In isn't a meaningful
  destination once you're already signed in (both routes still exist for their
  actual flows). Each unbuilt screen shows a "build me" tag. When you finish a
  screen, flip its `built` to true (and point `href` at the route you created)
  so it turns into a real link.
*/
type NavLink = { href: string; label: string; built: boolean; icon: typeof LayoutDashboard };

const GROUPS: { title: string; links: NavLink[] }[] = [
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

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  function handleSignOut() {
    signOut();
    router.push("/signin");
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="flex h-full w-64 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-white p-4">
      <div className="mb-5 flex items-center gap-2 px-1">
        <Image src="/verve-logo.png" alt="Verve" width={110} height={54} className="h-9 w-auto" priority />
        <span className="text-sm font-semibold text-slate-400">| AR Manager</span>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="mb-3">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {group.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.links.map((l) => {
              const Icon = l.icon;
              if (!l.built) {
                return (
                  <span
                    key={l.href}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      {l.label}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      build me
                    </span>
                  </span>
                );
              }
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-white" : "text-slate-400"}`} />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={handleSignOut}
        className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </nav>
  );
}
