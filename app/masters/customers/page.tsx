"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
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

const EMPTY_FORM: CustomerFormState = {
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

type CustomerInsert = Omit<Customer, "id" | "created_at"> & { created_at?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Header names match what the team asked for; each maps onto the actual
// `customers` columns in supabase/seed.sql (see the parsing below). Fields
// that don't exist in that table — status, shipping address, currency,
// payment terms, bank details, created by — aren't included here because
// there's nowhere in the shared database to store them.
const TEMPLATE_HEADERS = [
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

const TEMPLATE_SAMPLE_ROWS = [
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
  if (createdDate && !DATE_RE.test(createdDate)) errors.push("created_date must be YYYY-MM-DD");

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
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadCustomers() {
    if (!supabase || !isConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: fetchError } = await supabase.from("customers").select("*").order("code");
    if (!fetchError && data) setCustomers(data as Customer[]);
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

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
      credit_limit: String(customer.credit_limit),
      credit_days: String(customer.credit_days),
      opening_balance: String(customer.opening_balance),
    });
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !isConfigured) return;

    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and name are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload: CustomerInsert = {
      code: form.code.trim(),
      name: form.name.trim(),
      gstin: form.gstin.trim() || null,
      pan: form.pan.trim() || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      credit_limit: toNumber(form.credit_limit, 0),
      credit_days: toNumber(form.credit_days, 30),
      opening_balance: toNumber(form.opening_balance, 0),
    };

    const result = editingId
      ? await supabase.from("customers").update(payload).eq("id", editingId)
      : await supabase.from("customers").insert(payload);

    if (result.error) {
      setError(result.error.message.includes("duplicate") ? `Customer code "${payload.code}" already exists.` : "Could not save this customer. Please try again.");
    } else {
      setMessage(editingId ? "Customer updated." : "Customer added.");
      resetForm();
      await loadCustomers();
    }

    setSaving(false);
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

  const columns: Column<Customer>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "contact_person", header: "Contact" },
    { key: "credit_days", header: "Credit Days" },
    {
      key: "credit_limit",
      header: "Credit Limit",
      render: (row) => `₹${Number(row.credit_limit).toLocaleString("en-IN")}`,
    },
    {
      key: "actions",
      header: "",
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
  ];

  return (
    <>
      <PageHeader title="Customer Master" subtitle="The reference list of customers every other screen leans on." />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingId ? "Edit customer" : "Add a customer"}
                </h3>
                {editingId && (
                  <button type="button" onClick={resetForm} className="text-sm font-medium text-slate-500 hover:underline">
                    Cancel edit
                  </button>
                )}
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}
              {message && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Code">
                  <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </FormField>
                <FormField label="Name">
                  <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </FormField>
                <FormField label="Contact person">
                  <input className={inputClass} value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
                </FormField>
                <FormField label="Email">
                  <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </FormField>
                <FormField label="Phone">
                  <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </FormField>
                <FormField label="GSTIN">
                  <input className={inputClass} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
                </FormField>
                <FormField label="PAN">
                  <input className={inputClass} value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} />
                </FormField>
                <FormField label="Credit days">
                  <input className={inputClass} type="number" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: e.target.value })} />
                </FormField>
                <FormField label="Credit limit">
                  <input className={inputClass} type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
                </FormField>
                <FormField label="Opening balance">
                  <input className={inputClass} type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
                </FormField>
                <div className="col-span-2">
                  <FormField label="Address">
                    <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </FormField>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Add customer"}
              </button>
            </form>

            <CsvImport
              title="Bulk import customers"
              description="Download the sample CSV, fill in as many customers as you like, then upload it to add them all at once. (Fields like status, shipping address, currency, and bank details aren't tracked yet — only what's listed here is stored.)"
              templateFilename="customers_template.csv"
              templateHeaders={TEMPLATE_HEADERS}
              templateSampleRows={TEMPLATE_SAMPLE_ROWS}
              groupRows={groupCustomerRows}
              onImport={importCustomers}
              onImported={loadCustomers}
            />
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">All customers</h3>
            {loading ? (
              <p className="text-sm text-slate-500">Loading customers...</p>
            ) : (
              <DataTable columns={columns} rows={customers} empty="No customers yet — add one or import a CSV above." />
            )}
          </div>
        </div>
      )}
    </>
  );
}
