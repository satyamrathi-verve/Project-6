"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/Nav";
import { AuthGate } from "@/components/AuthGate";
import { ToastProvider } from "@/components/Toast";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSignIn = pathname === "/signin";

  return (
    <ToastProvider>
      <AuthGate>
        <div className="flex h-screen">
          {!isSignIn && <Nav />}
          <main className="flex-1 overflow-y-auto p-8">{children}</main>
        </div>
      </AuthGate>
    </ToastProvider>
  );
}
