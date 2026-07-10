"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/Nav";
import { TopBar } from "@/components/TopBar";
import { AuthGate } from "@/components/AuthGate";
import { ToastProvider } from "@/components/Toast";
import { CommandPaletteProvider } from "@/components/CommandPalette";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSignIn = pathname === "/signin";

  return (
    <ToastProvider>
      <CommandPaletteProvider>
        <AuthGate>
          <div className="flex h-screen">
            {!isSignIn && <Nav />}
            <div className="flex flex-1 flex-col overflow-hidden">
              {!isSignIn && <TopBar />}
              <main className="flex-1 overflow-y-auto bg-slate-50 p-8 dark:bg-slate-950">{children}</main>
            </div>
          </div>
        </AuthGate>
      </CommandPaletteProvider>
    </ToastProvider>
  );
}
