"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
  Home now redirects straight to the Dashboard, the finance team's
  at-a-glance overview.
*/

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return null;
}
