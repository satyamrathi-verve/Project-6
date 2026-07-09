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
import type { Customer } from "@/lib/types";

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
            onClick={resetForm}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {editingId ? "Cancel edit" : "Add Customer"}
          </button>
        }
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
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
                        onClick={() => startEdit(row)}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Edit
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

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {editingId ? "Edit customer" : "Add Customer"}
          </h3>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
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
            <FormField label="PAN">
              <input
                className={inputClass}
                value={form.pan}
                onChange={(e) => setForm((prev) => ({ ...prev, pan: e.target.value }))}
              />
            </FormField>
            <FormField label="Contact person">
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
            <FormField label="Phone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </FormField>
            <FormField label="Address">
              <textarea
                className={inputClass}
                rows={3}
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Credit days">
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
              <FormField label="Credit limit">
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
            </div>
            <FormField label="Opening balance">
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Saving…" : editingId ? "Save changes" : "Create Customer"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
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
