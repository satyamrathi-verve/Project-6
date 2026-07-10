"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { inputClass } from "@/components/FormField";
import { signIn } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

/*
  Front-end-only login gate: no real auth backend, no `users` table. Credentials
  are checked against this small demo list; on a match, a flag is stored in
  localStorage so a refresh stays signed in. See lib/auth.ts for the shared
  session helpers used by the rest of the app.
*/
const DEMO_LOGINS = [
  { username: "admin", password: "admin123" },
  { username: "finance", password: "finance123" },
];

const HIGHLIGHTS = [
  "Live outstanding on every customer",
  "Ageing, cashflow, and DSO at a glance",
  "Reminder emails & collection tracking",
];

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const match = DEMO_LOGINS.some(
      (l) => l.username === username && l.password === password
    );
    if (!match) {
      setError("Wrong username or password. Try admin / admin123.");
      setBusy(false);
      return;
    }
    signIn();
    setError("");
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen">
      {/* Branded panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/10 blur-2xl" />

        <div className="relative">
          <Image src="/verve-logo-white.png" alt="Verve" width={130} height={64} className="h-10 w-auto" priority />
        </div>

        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight">
            Accounts Receivable,
            <br />
            under control.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Track every invoice, chase overdue customers, and see your cashflow
            week by week — all in one place.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/90">
            {HIGHLIGHTS.map((line) => (
              <li key={line} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 flex-none text-white" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© Verve Advisory · AR Manager</p>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900/40 p-6">
        <div className="absolute right-4 top-4">
          <ThemeToggle variant="plain" />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Image src="/verve-logo.png" alt="Verve" width={110} height={54} className="h-9 w-auto" priority />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to your AR Manager account.</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Username
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  className={`${inputClass} w-full pl-10`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`${inputClass} w-full pl-10 pr-10`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950 dark:text-rose-300">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand/30 transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Demo logins: admin / admin123, finance / finance123
          </p>
        </div>
      </main>
    </div>
  );
}
