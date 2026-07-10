"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { findNavEntry } from "@/lib/nav";
import { useCommandPalette } from "@/components/CommandPalette";

export function TopBar() {
  const pathname = usePathname();
  const { open } = useCommandPalette();
  const entry = findNavEntry(pathname);
  // Read at mount only (not module scope) so SSR and the first client render
  // match; the shortcut hint updates a beat later on Mac, which is fine.
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl+K");

  useEffect(() => {
    if (/Mac|iPhone|iPod|iPad/.test(navigator.platform)) setShortcutLabel("⌘K");
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-800">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        {entry ? (
          <>
            <span className="text-slate-400 dark:text-slate-500">{entry.group}</span>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{entry.link.label}</span>
          </>
        ) : (
          <span className="font-medium text-slate-700 dark:text-slate-200">AR Manager</span>
        )}
      </nav>

      <button
        type="button"
        onClick={open}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400 transition hover:border-slate-300 hover:text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-300"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Jump to…</span>
        <kbd className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium dark:border-slate-600">
          {shortcutLabel}
        </kbd>
      </button>
    </header>
  );
}
