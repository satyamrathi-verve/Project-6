"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, inputClass } from "@/components/FormField";
import { signIn } from "@/lib/auth";

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

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const match = DEMO_LOGINS.some(
      (l) => l.username === username && l.password === password
    );
    if (!match) {
      setError("Wrong username or password. Try admin / admin123.");
      return;
    }
    signIn();
    setError("");
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">Verve</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Sign in to AR Manager</h2>
        <p className="mt-1 text-sm text-slate-500">Use one of the demo logins to continue.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Password">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">Demo logins: admin / admin123, finance / finance123</p>
      </div>
    </div>
  );
}
