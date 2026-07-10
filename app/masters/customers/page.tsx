"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { CsvImport } from "@/components/CsvImport";
import { TableSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isConfigured, supabase } from "@/lib/supabase";
import {
  CUSTOMER_CSV_TEMPLATE_HEADERS,
  CUSTOMER_CSV_TEMPLATE_SAMPLE_ROWS,
  groupCustomerRows,
  importCustomers,
} from "@/lib/csvImportCustomers";
import type { Customer, CustomerStatus } from "@/lib/types";

type CustomerFormState = {
  code: string;
  name: string;
  gstin: string;
  pan: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  credit_limit: string;
  credit_days: string;
  opening_balance: string;
};

const emptyForm: CustomerFormState = {
  code: "",
  name: "",
  gstin: "",
  pan: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  credit_limit: "0",
  credit_days: "30",
  opening_balance: "0",
};

function sanitizeNonNegative(value: string) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return "0";
  return String(Math.max(0, parsed));
}

export default function CustomerMasterPage() {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function loadCustomers() {
    if (!supabase) {
      setError("Supabase is not configured yet.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: supabaseError } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });

    if (supabaseError) {
      const message =
        supabaseError.message.includes("permission denied") || supabaseError.code === "42501"
          ? "Supabase permission denied for the customers table. The app is correct, but the table policy needs to allow read/write access for this project key."
          : supabaseError.message;
      setError(message);
      setCustomers([]);
    } else {
      setCustomers((data as Customer[]) ?? []);
      setError("");
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function clearForm() {
    setForm(emptyForm);
    setError("");
  }

  async function toggleStatus(customer: Customer) {
    if (!supabase) return;
    const nextStatus: CustomerStatus = customer.status === "active" ? "inactive" : "active";

    setCustomers((prev) =>
      prev.map((c) => (c.id === customer.id ? { ...c, status: nextStatus } : c))
    );

    const { error: supabaseError } = await supabase
      .from("customers")
      .update({ status: nextStatus })
      .eq("id", customer.id);

    if (supabaseError) {
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, status: customer.status } : c))
      );
      setError(supabaseError.message);
      toast.error(supabaseError.message);
    }
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      code: customer.code,
      name: customer.name,
      gstin: customer.gstin ?? "",
      pan: customer.pan ?? "",
      contact_person: customer.contact_person ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      credit_limit: String(customer.credit_limit ?? 0),
      credit_days: String(customer.credit_days ?? 0),
      opening_balance: String(customer.opening_balance ?? 0),
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError("");

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      gstin: form.gstin.trim() || null,
      pan: form.pan.trim() || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      credit_limit: Number(form.credit_limit || 0),
      credit_days: Number(form.credit_days || 0),
      opening_balance: Number(form.opening_balance || 0),
    };

    let result;
    if (editingId) {
      result = await supabase.from("customers").update(payload).eq("id", editingId);
    } else {
      result = await supabase.from("customers").insert(payload);
    }

    if (result.error) {
      const message =
        result.error.message.includes("permission denied") || result.error.code === "42501"
          ? "Supabase permission denied for the customers table. Please allow insert/update access for this project key."
          : result.error.message;
      setError(message);
      toast.error(message);
    } else {
      toast.success(editingId ? "Customer updated." : "Customer created.");
      resetForm();
      await loadCustomers();
    }

    setSubmitting(false);
  }

  return (
    <>
      <PageHeader
        title="Customer Master"
        subtitle="A simple list of customers with add and edit actions for the AR team."
        action={
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setEditingId(null);
              setShowForm((v) => !v);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Add Customer
          </button>
        }
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      {showForm && (
        <section className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {editingId ? "Edit Customer" : "Add Customer"}
          </h3>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Code">
                <input
                  className={inputClass}
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Name">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="GSTIN">
                <input
                  className={inputClass}
                  value={form.gstin}
                  onChange={(e) => setForm((prev) => ({ ...prev, gstin: e.target.value }))}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="PAN">
                <input
                  className={inputClass}
                  value={form.pan}
                  onChange={(e) => setForm((prev) => ({ ...prev, pan: e.target.value }))}
                />
              </FormField>
              <FormField label="Contact Person">
                <input
                  className={inputClass}
                  value={form.contact_person}
                  onChange={(e) => setForm((prev) => ({ ...prev, contact_person: e.target.value }))}
                />
              </FormField>
              <FormField label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone">
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </FormField>
              <FormField label="Address">
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Credit Days">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.credit_days}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, credit_days: sanitizeNonNegative(e.target.value) }))
                  }
                />
              </FormField>
              <FormField label="Credit Limit (₹)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.credit_limit}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, credit_limit: sanitizeNonNegative(e.target.value) }))
                  }
                />
              </FormField>
              <FormField label="Opening Balance (₹)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.opening_balance}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, opening_balance: sanitizeNonNegative(e.target.value) }))
                  }
                />
              </FormField>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving…" : editingId ? "Save changes" : "Create Customer"}
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
          Customer list
        </h3>
        {loading ? (
          <div className="mt-4">
            <TableSkeleton rows={6} />
          </div>
        ) : (
          <div className="mt-4">
            <DataTable
              columns={[
                { key: "code", header: "Code" },
                { key: "name", header: "Name" },
                { key: "contact_person", header: "Contact" },
                { key: "credit_days", header: "Credit days" },
                {
                  key: "credit_limit",
                  header: "Credit limit",
                  render: (row) => `₹${Number(row.credit_limit ?? 0).toLocaleString()}`,
                },
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
              rows={customers}
              empty="No customers found yet."
            />
          </div>
        )}
      </div>

      <div className="mt-6">
        <CsvImport
          title="Bulk import customers"
          description="Download the sample CSV, fill in as many customers as you like, then upload it to add them all at once. (Fields like status, shipping address, currency, and bank details aren't tracked yet — only what's listed here is stored.)"
          templateFilename="customers_template.csv"
          templateHeaders={CUSTOMER_CSV_TEMPLATE_HEADERS}
          templateSampleRows={CUSTOMER_CSV_TEMPLATE_SAMPLE_ROWS}
          groupRows={groupCustomerRows}
          onImport={importCustomers}
          onImported={loadCustomers}
        />
      </div>
    </>
  );
}
