"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { TableSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isConfigured, supabase } from "@/lib/supabase";
import type { ActiveStatus, GLAccount } from "@/lib/types";

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

function properCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function GLMasterPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAccounts() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: supabaseError } = await supabase
      .from("gl_accounts")
      .select("*")
      .order("code", { ascending: true });

    if (supabaseError) {
      setError(supabaseError.message);
      setAccounts([]);
    } else {
      setAccounts((data as GLAccount[]) ?? []);
      setError(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    setError(null);
    setMessage(null);
  }

  function clearForm() {
    setForm(emptyForm());
    setError(null);
    setMessage(null);
  }

  function startEdit(account: GLAccount) {
    setEditingId(account.id);
    setForm({
      code: account.code,
      name: account.name,
      type: account.type,
      parent_group: account.parent_group ?? "",
    });
    setMessage(null);
    setError(null);
    setShowForm(true);
  }

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

    const result = editingId
      ? await supabase.from("gl_accounts").update(payload).eq("id", editingId)
      : await supabase.from("gl_accounts").insert(payload);

    if (result.error) {
      setError(result.error.message);
      toast.error(result.error.message);
    } else {
      const successMessage = editingId ? "Account updated successfully." : "Account added successfully.";
      setMessage(successMessage);
      toast.success(successMessage);
      resetForm();
      await loadAccounts();
    }

    setSaving(false);
  }

  async function toggleStatus(account: GLAccount) {
    if (!supabase) return;
    const nextStatus: ActiveStatus = account.status === "active" ? "inactive" : "active";

    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, status: nextStatus } : a))
    );

    const { error: supabaseError } = await supabase
      .from("gl_accounts")
      .update({ status: nextStatus })
      .eq("id", account.id);

    if (supabaseError) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, status: account.status } : a))
      );
      setError(supabaseError.message);
      toast.error(supabaseError.message);
    }
  }

  return (
    <>
      <PageHeader
        title="GL Master"
        subtitle="Maintain your ledger accounts for sales, debtors, bank, discounts, and more."
        action={
          isConfigured ? (
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm());
                setEditingId(null);
                setMessage(null);
                setError(null);
                setShowForm((v) => !v);
              }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Add Account
            </button>
          ) : undefined
        }
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <>
          {showForm && (
            <section className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? "Edit Account" : "Add Account"}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Type">
                    <select
                      required
                      value={form.type}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, type: event.target.value as AccountForm["type"] }))
                      }
                      className={inputClass}
                    >
                      {ACCOUNT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {properCase(type)}
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
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}
                {message && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {message}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Saving…" : editingId ? "Save changes" : "Add account"}
                  </button>
                  <button
                    type="button"
                    onClick={clearForm}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ledger accounts
            </h3>
            {loading ? (
              <div className="mt-4">
                <TableSkeleton rows={6} />
              </div>
            ) : (
              <div className="mt-4">
                <DataTable
                  rows={accounts}
                  columns={[
                    { key: "code", header: "Code" },
                    { key: "name", header: "Name" },
                    { key: "type", header: "Type", render: (row) => properCase(row.type) },
                    { key: "parent_group", header: "Parent group" },
                    {
                      key: "id",
                      header: "Action",
                      render: (row) => (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          Edit
                        </button>
                      ),
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (row) => (
                        <button
                          type="button"
                          onClick={() => toggleStatus(row)}
                          title="Click to toggle Active / Inactive"
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.status === "inactive"
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {row.status === "inactive" ? "Inactive" : "Active"}
                        </button>
                      ),
                    },
                  ]}
                  empty="No GL accounts found."
                />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
