'use client';

import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { PageHeader } from "@/components/PageHeader";
import { isConfigured, supabase } from "@/lib/supabase";
import type { Customer } from "@/lib/types";

type CustomerFormState = {
  id?: string;
  code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  credit_limit: string;
  credit_days: string;
};

const emptyForm = (): CustomerFormState => ({
  code: "",
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  credit_limit: "",
  credit_days: "",
});

export default function CustomerMasterPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*").order("name", { ascending: true });

    if (error) {
      setError(error.message);
      setCustomers([]);
    } else {
      setCustomers((data as Customer[]) ?? []);
      setError(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setSaving(true);
    setError(null);

    const payload = {
      code: form.code,
      name: form.name,
      contact_person: form.contact_person || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      credit_limit: Number(form.credit_limit) || 0,
      credit_days: Number(form.credit_days) || 0,
      opening_balance: 0,
    };

    if (form.id) {
      const { error } = await supabase.from("customers").update(payload).eq("id", form.id);
      if (error) {
        setError(error.message);
      } else {
        setForm(emptyForm());
        await loadCustomers();
      }
    } else {
      const { error } = await supabase.from("customers").insert(payload);
      if (error) {
        setError(error.message);
      } else {
        setForm(emptyForm());
        await loadCustomers();
      }
    }

    setSaving(false);
  };

  const handleEdit = (customer: Customer) => {
    setForm({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      contact_person: customer.contact_person ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      credit_limit: String(customer.credit_limit ?? 0),
      credit_days: String(customer.credit_days ?? 0),
    });
  };

  const handleCancel = () => {
    setForm(emptyForm());
  };

  return (
    <>
      <PageHeader
        title="Customer Master"
        subtitle="Keep the customer list current and use it across invoices, receipts, and reports."
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Customers</h3>
              <p className="text-sm text-slate-500">A simple list to start the AR workflow.</p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Loading customers...
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "code", header: "Code" },
                { key: "name", header: "Name" },
                { key: "contact_person", header: "Contact" },
                { key: "credit_days", header: "Credit Days" },
                {
                  key: "credit_limit",
                  header: "Credit Limit",
                  render: (row) => <span>{formatCurrency(row.credit_limit)}</span>,
                },
                {
                  key: "actions",
                  header: "",
                  render: (row) => (
                    <button
                      type="button"
                      onClick={() => handleEdit(row)}
                      className="text-sm font-medium text-brand hover:text-brand/80"
                    >
                      Edit
                    </button>
                  ),
                },
              ]}
              rows={customers}
              empty="No customers found yet."
            />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-slate-900">{form.id ? "Edit customer" : "Add customer"}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {form.id ? "Update the customer record below." : "Create a new customer to use across the app."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Customer code">
                <input
                  required
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value })}
                  className={inputClass}
                  placeholder="CUST001"
                />
              </FormField>

              <FormField label="Customer name">
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className={inputClass}
                  placeholder="Example Ltd"
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Contact person">
                <input
                  value={form.contact_person}
                  onChange={(event) => setForm({ ...form, contact_person: event.target.value })}
                  className={inputClass}
                  placeholder="Asha Kumar"
                />
              </FormField>

              <FormField label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  className={inputClass}
                  placeholder="ops@example.com"
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone">
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  className={inputClass}
                  placeholder="9876543210"
                />
              </FormField>

              <FormField label="Credit days">
                <input
                  type="number"
                  min="0"
                  value={form.credit_days}
                  onChange={(event) => setForm({ ...form, credit_days: event.target.value })}
                  className={inputClass}
                  placeholder="30"
                />
              </FormField>
            </div>

            <FormField label="Address">
              <textarea
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                className={`${inputClass} min-h-24 resize-y`}
                placeholder="Street, city, state"
              />
            </FormField>

            <FormField label="Credit limit">
              <input
                type="number"
                min="0"
                value={form.credit_limit}
                onChange={(event) => setForm({ ...form, credit_limit: event.target.value })}
                className={inputClass}
                placeholder="250000"
              />
            </FormField>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : form.id ? "Update customer" : "Save customer"}
              </button>
              {form.id && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}
