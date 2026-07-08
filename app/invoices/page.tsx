'use client';

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { CsvImport, type CsvImportGroup, type CsvImportResult } from "@/components/CsvImport";
import { isConfigured, supabase } from "@/lib/supabase";
import type { CsvRow } from "@/lib/csv";
import type { Customer, Invoice, InvoiceItem, InvoiceStatus } from "@/lib/types";

type InvoiceLineInput = { description: string; qty: number; rate: number; amount: number };

type InvoiceGroupInsert = {
  invoice_no: string;
  invoice_date: string;
  customer_id: string;
  customer_code: string;
  due_date: string;
  created_at?: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  items: InvoiceLineInput[];
};

const CSV_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CSV_STATUS_VALUES: InvoiceStatus[] = ["open", "partial", "paid", "overdue"];

// Header names match what the team asked for; each maps onto the actual
// `invoices` / `invoice_items` columns in supabase/seed.sql. `rate` has to
// stay (there's no way to get a line's value from quantity alone), and
// `tax_amount` is the closest real equivalent to tax%/IGST/CGST/SGST — the
// schema only stores one combined tax figure per invoice, not a per-line
// split. Fields with no home in the schema (sales order #, item code, unit,
// discount, currency, created by) aren't part of the template.
const CSV_TEMPLATE_HEADERS = [
  "invoice_date",
  "invoice_number",
  "customer_id",
  "customer_name",
  "due_date",
  "created_date",
  "tax_amount",
  "remarks",
  "item_description",
  "quantity",
  "rate",
];

const CSV_TEMPLATE_SAMPLE_ROWS = [
  ["2026-07-01", "INV-2001", "CUST-101", "Acme Traders", "", "2026-07-01", "900", "", "Consulting services - June", "10", "1500"],
  ["2026-07-01", "INV-2001", "CUST-101", "Acme Traders", "", "2026-07-01", "900", "", "Travel reimbursement", "1", "2000"],
  ["2026-07-03", "INV-2002", "CUST-102", "Bright Textiles", "2026-08-02", "2026-07-03", "0", "Urgent delivery surcharge", "Express delivery", "2", "750"],
];

const EMPTY_LINE = {
  id: "",
  invoice_id: "",
  description: "",
  qty: "1",
  rate: "0",
  amount: 0,
};

type InvoiceLine = typeof EMPTY_LINE;

type InvoiceForm = {
  id?: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  customer_id: string;
  notes: string;
  tax_amount: string;
  status: string;
  items: InvoiceLine[];
};

const today = new Date().toISOString().slice(0, 10);

const emptyInvoiceForm = (): InvoiceForm => ({
  invoice_no: "",
  invoice_date: today,
  due_date: today,
  customer_id: "",
  notes: "",
  tax_amount: "0",
  status: "open",
  items: [{ ...EMPTY_LINE }],
});

export default function InvoicePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState<InvoiceForm>(emptyInvoiceForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((customer) => [customer.id, customer])),
    [customers]
  );

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = Number(form.tax_amount) || 0;
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [form.items, form.tax_amount]);

  const invoiceRows = useMemo(
    () =>
      invoices.map((invoice) => ({
        ...invoice,
        customer: customerMap[invoice.customer_id]?.name ?? "Unknown",
      })),
    [invoices, customerMap]
  );

  async function loadData() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const [customerRes, invoiceRes] = await Promise.all([
      supabase.from("customers").select("*").order("name", { ascending: true }),
      supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
    ]);

    if (customerRes.error) {
      setError(customerRes.error.message);
      setCustomers([]);
    } else {
      setCustomers(customerRes.data as Customer[]);
    }

    if (invoiceRes.error) {
      setError(invoiceRes.error.message);
      setInvoices([]);
    } else {
      setInvoices(invoiceRes.data as Invoice[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const customersByCode = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.code, c));
    return map;
  }, [customers]);

  useEffect(() => {
    if (!form.customer_id) return;
    const customer = customerMap[form.customer_id];
    if (!customer) return;
    const due = computeDueDate(form.invoice_date, customer.credit_days);
    setForm((current) => ({ ...current, due_date: due }));
  }, [form.customer_id, form.invoice_date, customerMap]);

  const handleSelectInvoice = async (invoice: Invoice) => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("id", { ascending: true });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSelectedId(invoice.id);
    setForm({
      id: invoice.id,
      invoice_no: invoice.invoice_no,
      invoice_date: invoice.invoice_date.slice(0, 10),
      due_date: invoice.due_date.slice(0, 10),
      customer_id: invoice.customer_id,
      notes: invoice.notes ?? "",
      tax_amount: String(invoice.tax_amount ?? 0),
      status: invoice.status,
      items:
        (data as InvoiceItem[]).map((item) => ({
          id: item.id,
          invoice_id: item.invoice_id,
          description: item.description,
          qty: String(item.qty),
          rate: String(item.rate),
          amount: item.amount,
        })) || [{ ...EMPTY_LINE }],
    });
    setLoading(false);
  };

  const handleChangeItem = (index: number, field: keyof InvoiceLine, value: string) => {
    setForm((current) => {
      const next = [...current.items];
      const item = { ...next[index], [field]: value };
      if (field === "qty" || field === "rate") {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        item.amount = qty * rate;
      }
      next[index] = item;
      return { ...current, items: next };
    });
  };

  const handleAddItem = () => {
    setForm((current) => ({ ...current, items: [...current.items, { ...EMPTY_LINE }]}));
  };

  const handleRemoveItem = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((_, i) => i !== index) : [{ ...EMPTY_LINE }],
    }));
  };

  const handleReset = () => {
    setSelectedId(null);
    setForm(emptyInvoiceForm());
    setError(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setSaving(true);
    setError(null);

    const payload = {
      invoice_no: form.invoice_no,
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      customer_id: form.customer_id,
      subtotal: totals.subtotal,
      tax_amount: Number(form.tax_amount) || 0,
      total: totals.total,
      status: form.status || "open",
      notes: form.notes || null,
    };

    try {
      if (selectedId) {
        const { error: invoiceError } = await supabase.from("invoices").update(payload).eq("id", selectedId);
        if (invoiceError) throw invoiceError;

        const { error: deleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", selectedId);
        if (deleteError) throw deleteError;

        if (form.items.length > 0) {
          const itemsToSave = form.items.map((item) => ({
            invoice_id: selectedId,
            description: item.description,
            qty: Number(item.qty) || 0,
            rate: Number(item.rate) || 0,
            amount: item.amount,
          }));
          const { error: insertItemsError } = await supabase.from("invoice_items").insert(itemsToSave);
          if (insertItemsError) throw insertItemsError;
        }
      } else {
        const { data: insertedInvoice, error: insertError } = await supabase
          .from("invoices")
          .insert({ ...payload, status: "open" })
          .select("id")
          .single();
        if (insertError || !insertedInvoice) throw insertError ?? new Error("Could not create invoice.");

        const itemsToSave = form.items.map((item) => ({
          invoice_id: insertedInvoice.id,
          description: item.description,
          qty: Number(item.qty) || 0,
          rate: Number(item.rate) || 0,
          amount: item.amount,
        }));

        if (itemsToSave.length > 0) {
          const { error: insertItemsError } = await supabase.from("invoice_items").insert(itemsToSave);
          if (insertItemsError) throw insertItemsError;
        }
      }

      const refresh = await supabase.from("invoices").select("*").order("invoice_date", { ascending: false });
      if (refresh.error) throw refresh.error;
      setInvoices(refresh.data as Invoice[]);
      setSelectedId(null);
      setForm(emptyInvoiceForm());
    } catch (saveError) {
      setError((saveError as Error).message);
    }

    setSaving(false);
  };

  function groupInvoiceRows(rows: CsvRow[]): CsvImportGroup<InvoiceGroupInsert>[] {
    const order: string[] = [];
    const byInvoiceNo = new Map<string, CsvRow[]>();

    rows.forEach((row) => {
      const key = row.invoice_number?.trim();
      if (!key) return;
      if (!byInvoiceNo.has(key)) {
        order.push(key);
        byInvoiceNo.set(key, []);
      }
      byInvoiceNo.get(key)!.push(row);
    });

    // Rows with no invoice_number at all can't be grouped — surface them as their own error entries.
    const orphanRows = rows.filter((r) => !r.invoice_number?.trim());

    const groups: CsvImportGroup<InvoiceGroupInsert>[] = order.map((invoiceNo) => {
      const lines = byInvoiceNo.get(invoiceNo)!;
      const header = lines[0];
      const errors: string[] = [];

      const invoiceDate = header.invoice_date?.trim();
      const customerCode = header.customer_id?.trim();
      const customer = customerCode ? customersByCode.get(customerCode) : undefined;

      if (!invoiceDate || !CSV_DATE_RE.test(invoiceDate)) errors.push("invoice_date must be YYYY-MM-DD");
      if (!customerCode) errors.push("customer_id is required");
      else if (!customer) errors.push(`customer_id "${customerCode}" not found`);

      let dueDate = header.due_date?.trim();
      if (dueDate && !CSV_DATE_RE.test(dueDate)) errors.push("due_date must be YYYY-MM-DD");
      if (!dueDate && invoiceDate && CSV_DATE_RE.test(invoiceDate) && customer) {
        dueDate = computeDueDate(invoiceDate, customer.credit_days);
      }

      const createdDate = header.created_date?.trim();
      if (createdDate && !CSV_DATE_RE.test(createdDate)) errors.push("created_date must be YYYY-MM-DD");

      const items: InvoiceLineInput[] = [];
      lines.forEach((line, i) => {
        const description = line.item_description?.trim();
        const qty = Number(line.quantity);
        const rate = Number(line.rate);
        if (!description) {
          errors.push(`line ${i + 1}: item_description is required`);
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          errors.push(`line ${i + 1}: quantity must be a positive number`);
          return;
        }
        if (!Number.isFinite(rate) || rate < 0) {
          errors.push(`line ${i + 1}: rate must be a number`);
          return;
        }
        items.push({ description, qty, rate, amount: qty * rate });
      });

      if (items.length === 0 && errors.length === 0) errors.push("needs at least one line item");

      const taxAmount = Number(header.tax_amount);
      const tax = Number.isFinite(taxAmount) ? taxAmount : 0;
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const statusValue = (header.status?.trim().toLowerCase() as InvoiceStatus) || "open";
      const status = CSV_STATUS_VALUES.includes(statusValue) ? statusValue : "open";

      const data: InvoiceGroupInsert | null =
        errors.length === 0
          ? {
              invoice_no: invoiceNo,
              invoice_date: invoiceDate!,
              customer_id: customer!.id,
              customer_code: customerCode!,
              due_date: dueDate!,
              ...(createdDate ? { created_at: createdDate } : {}),
              subtotal,
              tax_amount: tax,
              total: subtotal + tax,
              status,
              notes: header.remarks?.trim() || null,
              items,
            }
          : null;

      return {
        key: invoiceNo,
        label: `${invoiceNo} (${lines.length} line${lines.length === 1 ? "" : "s"})`,
        data,
        errors,
      };
    });

    orphanRows.forEach((row, i) => {
      groups.push({
        key: `orphan-${i}`,
        label: `Row without invoice_number (${row.item_description || "unlabeled"})`,
        data: null,
        errors: ["invoice_number is required"],
      });
    });

    return groups;
  }

  async function importInvoices(items: InvoiceGroupInsert[]): Promise<CsvImportResult[]> {
    if (!supabase) return items.map((item) => ({ key: item.invoice_no, ok: false, message: "Supabase is not connected." }));

    const results: CsvImportResult[] = [];
    for (const item of items) {
      const { items: lines, customer_code, ...header } = item;

      const invoiceInsert = await supabase.from("invoices").insert(header).select("id").single();
      if (invoiceInsert.error || !invoiceInsert.data) {
        results.push({
          key: item.invoice_no,
          ok: false,
          message: invoiceInsert.error?.message.includes("duplicate") ? "invoice_no already exists" : "insert failed",
        });
        continue;
      }

      const invoiceId = invoiceInsert.data.id as string;
      const lineInsert = await supabase
        .from("invoice_items")
        .insert(lines.map((line) => ({ ...line, invoice_id: invoiceId })));

      if (lineInsert.error) {
        await supabase.from("invoices").delete().eq("id", invoiceId);
        results.push({ key: item.invoice_no, ok: false, message: "line items failed, invoice rolled back" });
        continue;
      }

      results.push({ key: item.invoice_no, ok: true, message: `${customer_code} — ₹${item.total.toLocaleString("en-IN")}` });
    }
    return results;
  }

  return (
    <>
      <PageHeader
        title="Sales Invoice — Punch / Edit"
        subtitle="Create new invoices or edit existing ones with line-items and a due date auto-filled from customer credit terms."
      />

      {!isConfigured && <NotConfigured />}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Invoice list</h3>
              <p className="text-sm text-slate-500">Pick an invoice to edit or create a new one.</p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              New invoice
            </button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading invoices...</div>
          ) : (
            <DataTable
              rows={invoiceRows}
              columns={[
                { key: "invoice_no", header: "Invoice #" },
                { key: "invoice_date", header: "Date" },
                { key: "customer", header: "Customer" },
                { key: "due_date", header: "Due" },
                {
                  key: "total",
                  header: "Total",
                  render: (row) => <span>{formatCurrency(row.total)}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => (
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  render: (row) => (
                    <button
                      type="button"
                      onClick={() => handleSelectInvoice(row)}
                      className="text-sm font-medium text-brand hover:text-brand/80"
                    >
                      Edit
                    </button>
                  ),
                },
              ]}
              empty="No invoices found."
            />
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900">{selectedId ? "Edit invoice" : "New invoice"}</h3>
            <p className="text-sm text-slate-500">Enter invoice details and line items, then save.</p>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Invoice #">
                <input
                  required
                  value={form.invoice_no}
                  onChange={(event) => setForm((current) => ({ ...current, invoice_no: event.target.value }))}
                  className={inputClass}
                  placeholder="INV-1001"
                />
              </FormField>

              <FormField label="Customer">
                <select
                  required
                  value={form.customer_id}
                  onChange={(event) => setForm((current) => ({ ...current, customer_id: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Invoice date">
                <input
                  required
                  type="date"
                  value={form.invoice_date}
                  onChange={(event) => setForm((current) => ({ ...current, invoice_date: event.target.value }))}
                  className={inputClass}
                />
              </FormField>

              <FormField label="Due date">
                <input value={form.due_date} readOnly className={`${inputClass} bg-slate-100`} />
              </FormField>
            </div>

            <FormField label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className={`${inputClass} min-h-[100px] resize-y`}
                placeholder="Add any invoice notes here"
              />
            </FormField>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Line items</p>
                <button type="button" onClick={handleAddItem} className="text-sm font-medium text-brand hover:text-brand/80">
                  + Add item
                </button>
              </div>
              <div className="space-y-4">
                {form.items.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_auto]">
                    <FormField label="Description">
                      <input
                        value={item.description}
                        onChange={(event) => handleChangeItem(index, "description", event.target.value)}
                        className={inputClass}
                        placeholder="Item description"
                      />
                    </FormField>
                    <FormField label="Qty">
                      <input
                        type="number"
                        min="0"
                        value={item.qty}
                        onChange={(event) => handleChangeItem(index, "qty", event.target.value)}
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="Rate">
                      <input
                        type="number"
                        min="0"
                        value={item.rate}
                        onChange={(event) => handleChangeItem(index, "rate", event.target.value)}
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="Amount">
                      <input value={formatCurrency(item.amount)} readOnly className={`${inputClass} bg-slate-100`} />
                    </FormField>
                    <div className="flex items-end justify-end pb-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="text-sm font-medium text-rose-600 hover:text-rose-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Tax amount">
                <input
                  type="number"
                  min="0"
                  value={form.tax_amount}
                  onChange={(event) => setForm((current) => ({ ...current, tax_amount: event.target.value }))}
                  className={inputClass}
                />
              </FormField>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Summary</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
                  <div className="flex items-center justify-between"><span>Tax</span><span>{formatCurrency(totals.taxAmount)}</span></div>
                  <div className="border-t border-slate-200 pt-2 flex items-center justify-between font-semibold"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
                </div>
              </div>
            </div>

            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : selectedId ? "Update invoice" : "Save invoice"}
              </button>
              {selectedId && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Create new invoice
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      <div className="mt-6">
        <CsvImport
          title="Bulk import invoices"
          description="Download the sample CSV, add one row per line item (repeat the invoice_number to group lines under one invoice), then upload. Totals are calculated automatically. (Sales order #, item code, unit, discount, tax%, IGST/CGST/SGST and currency aren't tracked yet — only what's listed here is stored.)"
          templateFilename="invoices_template.csv"
          templateHeaders={CSV_TEMPLATE_HEADERS}
          templateSampleRows={CSV_TEMPLATE_SAMPLE_ROWS}
          groupRows={groupInvoiceRows}
          onImport={importInvoices}
          onImported={loadData}
        />
      </div>
    </>
  );
}

function computeDueDate(dateString: string, creditDays: number) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + creditDays);
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function statusClass(status: string) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "overdue":
      return "bg-rose-100 text-rose-700";
    case "partial":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
