'use client';

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { TableSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isConfigured, supabase } from "@/lib/supabase";
import type { GLAccount } from "@/lib/types";

const ACCOUNT_TYPES = ["asset", "liability", "income", "expense"] as const;

type AccountForm = {
  code: string;
  name: string;
  type: "asset" | "liability" | "income" | "expense";
  parent_group: string;
};

const emptyForm = (): AccountForm => ({
  code: "",
  name: "",
  type: "asset",
  parent_group: "",
});

export default function GLMasterPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccounts() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("gl_accounts")
        .select("*")
        .order("code", { ascending: true });

      if (error) {
        setError(error.message);
        setAccounts([]);
      } else {
        setAccounts(data as GLAccount[]);
        setError(null);
      }

      setLoading(false);
    }

    loadAccounts();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      parent_group: form.parent_group.trim() || null,
    };

    const { error } = await supabase.from("gl_accounts").insert(payload);
    if (error) {
      setError(error.message);
      toast.error(error.message);
    } else {
      setMessage("Account added successfully.");
      toast.success("Account added successfully.");
      setForm(emptyForm());
      const refresh = await supabase.from("gl_accounts").select("*").order("code", { ascending: true });
      if (!refresh.error) {
        setAccounts(refresh.data as GLAccount[]);
      }
    }

    setSaving(false);
  }

  return (
    <>
      <PageHeader
        title="GL Master"
        subtitle="Maintain your ledger accounts for sales, debtors, bank, discounts, and more."
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Ledger accounts</h3>
              <p className="text-sm text-slate-500">
                A reference list of GL accounts used throughout invoices and reporting.
              </p>
            </div>

            {loading ? (
              <TableSkeleton rows={6} />
            ) : (
              <DataTable
                rows={accounts}
                columns={[
                  { key: "code", header: "Code" },
                  { key: "name", header: "Name" },
                  { key: "type", header: "Type" },
                  { key: "parent_group", header: "Parent group" },
                ]}
                empty="No GL accounts found."
              />
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Add a new account</h3>
              <p className="text-sm text-slate-500">Create a ledger account used across sales and collections.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Account code">
                <input
                  required
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  className={inputClass}
                  placeholder="SALES"
                />
              </FormField>

              <FormField label="Account name">
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className={inputClass}
                  placeholder="Sales Revenue"
                />
              </FormField>

              <FormField label="Type">
                <select
                  required
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AccountForm["type"] }))}
                  className={inputClass}
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Parent group">
                <input
                  value={form.parent_group}
                  onChange={(event) => setForm((current) => ({ ...current, parent_group: event.target.value }))}
                  className={inputClass}
                  placeholder="e.g. Revenue"
                />
              </FormField>

              {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
              {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Add account"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
