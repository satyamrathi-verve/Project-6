"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { CsvImport, type CsvImportGroup, type CsvImportResult } from "@/components/CsvImport";
import { isConfigured, supabase } from "@/lib/supabase";
import type { CsvRow } from "@/lib/csv";
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

type CustomerInsert = Omit<Customer, "id" | "created_at"> & { created_at?: string };

const CSV_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Header names match what the team asked for; each maps onto the actual
// `customers` columns in supabase/seed.sql (see the parsing below). Fields
// that don't exist in that table — status, shipping address, currency,
// payment terms, bank details, created by — aren't included here because
// there's nowhere in the shared database to store them.
const CSV_TEMPLATE_HEADERS = [
  "customer_id",
  "customer_name",
  "gstin",
  "email_address",
  "contact_number",
  "billing_address",
  "pan",
  "contact_person",
  "credit_limit",
  "credit_days",
  "opening_balance",
  "created_date",
];

const CSV_TEMPLATE_SAMPLE_ROWS = [
  [
    "CUST-101",
    "Acme Traders",
    "29ABCDE1234F1Z5",
    "rahul@acmetraders.com",
    "9876543210",
    "123 MG Road, Bengaluru",
    "ABCDE1234F",
    "Rahul Shah",
    "500000",
    "45",
    "0",
    "2026-01-15",
  ],
  [
    "CUST-102",
    "Bright Textiles",
    "",
    "priya@brighttex.com",
    "9123456780",
    "45 Anna Salai, Chennai",
    "",
    "Priya Nair",
    "250000",
    "30",
    "15000",
    "",
  ],
];

function toNumber(value: string, fallback: number): number {
  if (value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validateCustomerRow(row: CsvRow): { data: CustomerInsert | null; errors: string[] } {
  const errors: string[] = [];
  const code = row.customer_id?.trim();
  const name = row.customer_name?.trim();

  if (!code) errors.push("customer_id is required");
  if (!name) errors.push("customer_name is required");

  const createdDate = row.created_date?.trim();
  if (createdDate && !CSV_DATE_RE.test(createdDate)) errors.push("created_date must be YYYY-MM-DD");

  if (errors.length > 0) return { data: null, errors };

  return {
    data: {
      code: code!,
      name: name!,
      gstin: row.gstin?.trim() || null,
      pan: row.pan?.trim() || null,
      contact_person: row.contact_person?.trim() || null,
      email: row.email_address?.trim() || null,
      phone: row.contact_number?.trim() || null,
      address: row.billing_address?.trim() || null,
      credit_limit: toNumber(row.credit_limit, 0),
      credit_days: toNumber(row.credit_days, 30),
      opening_balance: toNumber(row.opening_balance, 0),
      ...(createdDate ? { created_at: createdDate } : {}),
    },
    errors: [],
  };
}

export default function CustomerMasterPage() {
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
    } else {
      resetForm();
      await loadCustomers();
    }

    setSubmitting(false);
  }

  function groupCustomerRows(rows: CsvRow[]): CsvImportGroup<CustomerInsert>[] {
    return rows.map((row, index) => {
      const { data, errors } = validateCustomerRow(row);
      const label = row.customer_id?.trim() || `Row ${index + 2}`;
      return { key: `${label}-${index}`, label, data, errors };
    });
  }

  async function importCustomers(items: CustomerInsert[]): Promise<CsvImportResult[]> {
    if (!supabase) return items.map((item) => ({ key: item.code, ok: false, message: "Supabase is not connected." }));

    const results: CsvImportResult[] = [];
    for (const item of items) {
      const { error: insertError } = await supabase.from("customers").insert(item);
      if (insertError) {
        results.push({
          key: item.code,
          ok: false,
          message: insertError.message.includes("duplicate") ? "code already exists" : "insert failed",
        });
      } else {
        results.push({ key: item.code, ok: true, message: item.name });
      }
    }
    return results;
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
            <p className="mt-4 text-sm text-slate-500">Loading customers…</p>
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
          templateHeaders={CSV_TEMPLATE_HEADERS}
          templateSampleRows={CSV_TEMPLATE_SAMPLE_ROWS}
          groupRows={groupCustomerRows}
          onImport={importCustomers}
          onImported={loadCustomers}
        />
      </div>
    </>
  );
}
