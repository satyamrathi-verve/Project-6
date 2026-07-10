"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";
import { NAV_GROUPS } from "@/lib/nav";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <nav className="flex h-full w-64 flex-col gap-1 overflow-y-auto bg-brand p-4">
      <div className="mb-5 flex items-center gap-2 px-1">
        <Image src="/verve-logo-white.png" alt="Verve" width={110} height={54} className="h-9 w-auto" priority />
        <span className="text-sm font-semibold text-white/70">| AR Manager</span>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-3">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            {group.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.links.map((l) => {
              const Icon = l.icon;
              if (!l.built) {
                return (
                  <span
                    key={l.href}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white/30"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      {l.label}
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/40">
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
                    active ? "bg-white text-brand" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-brand" : "text-white/50"}`} />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-0.5">
        <ThemeToggle />
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/70 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </nav>
  );
}
