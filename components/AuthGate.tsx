"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isSignedIn } from "@/lib/auth";

/*
  Hides the app until the front-end-only Sign In flag is set. /signin itself
  is always shown so there's somewhere to log in from.
*/
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === "/signin") {
      setReady(true);
      return;
    }
    if (!isSignedIn()) {
      router.push("/signin");
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) return null;

  return <>{children}</>;
}
