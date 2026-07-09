"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { NotConfigured } from "@/components/NotConfigured";
import { StatusBadge } from "@/components/StatusBadge";
import { FormField, inputClass } from "@/components/FormField";
import { CsvImport } from "@/components/CsvImport";
import { TableSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import type { CsvRow } from "@/lib/csv";
import {
  INVOICE_CSV_TEMPLATE_HEADERS,
  INVOICE_CSV_TEMPLATE_SAMPLE_ROWS,
  groupInvoiceRows,
  importInvoices,
} from "@/lib/csvImportInvoices";
import type { Customer, Invoice, InvoiceItem, InvoiceStatus } from "@/lib/types";

/*
  Sales Invoice — List. "+ New Invoice" opens the punch/edit form inline above
  the list (same pattern as Receipt Entry's "+ New Receipt"), with Save/Cancel.
  Each row also has an Edit action that opens the same form pre-filled.
  Every column header has its own filter dropdown (click the funnel icon), and
  every column is sortable (click the header text).
  There's no `so_number` column in the database (see supabase/seed.sql), so it's
  left out here rather than inventing one — ask the team if that field is needed.
*/

type InvoiceRow = Invoice & {
  customer: { name: string; code: string } | null;
};

type SortKey = "invoice_no" | "invoice_date" | "due_date" | "customer" | "total" | "notes" | "status";

const STATUS_FILTERS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

function compareInvoices(a: InvoiceRow, b: InvoiceRow, key: SortKey): number {
  switch (key) {
    case "invoice_no":
      return a.invoice_no.localeCompare(b.invoice_no);
    case "invoice_date":
      return a.invoice_date.localeCompare(b.invoice_date);
    case "due_date":
      return a.due_date.localeCompare(b.due_date);
    case "customer":
      return (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "");
    case "total":
      return Number(a.total) - Number(b.total);
    case "notes":
      return (a.notes ?? "").localeCompare(b.notes ?? "");
    case "status":
      return a.status.localeCompare(b.status);
  }
}

const EMPTY_LINE = { id: "", invoice_id: "", description: "", qty: "1", rate: "0", amount: 0 };
type InvoiceLine = typeof EMPTY_LINE;

type InvoiceFormState = {
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  customer_id: string;
  notes: string;
  tax_amount: string;
  status: InvoiceStatus;
  items: InvoiceLine[];
};

const todayStr = new Date().toISOString().slice(0, 10);

function emptyInvoiceForm(): InvoiceFormState {
  return {
    invoice_no: "",
    invoice_date: todayStr,
    due_date: todayStr,
    customer_id: "",
    notes: "",
    tax_amount: "0",
    status: "open",
    items: [{ ...EMPTY_LINE }],
  };
}

function computeDueDate(dateString: string, creditDays: number) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + creditDays);
  return date.toISOString().slice(0, 10);
}

export default function InvoiceListPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const [invoiceNoSearch, setInvoiceNoSearch] = useState("");
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [minDueDate, setMinDueDate] = useState("");
  const [maxDueDate, setMaxDueDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [memoSearch, setMemoSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");

  const [sortKey, setSortKey] = useState<SortKey>("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [csvCustomers, setCsvCustomers] = useState<Customer[]>([]);

  // Inline "New Invoice" / "Edit Invoice" form (same pattern as Receipt Entry)
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<InvoiceFormState>(emptyInvoiceForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadInvoices() {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("invoices")
      .select("*, customer:customers(name, code)")
      .order("invoice_date", { ascending: false });
    setInvoices((data as unknown as InvoiceRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("customers")
      .select("*")
      .then(({ data }) => setCsvCustomers((data as Customer[]) ?? []));
  }, []);

  const customersByCode = useMemo(() => {
    const map = new Map<string, Customer>();
    csvCustomers.forEach((c) => map.set(c.code, c));
    return map;
  }, [csvCustomers]);

  const customersById = useMemo(() => {
    const map = new Map<string, Customer>();
    csvCustomers.forEach((c) => map.set(c.id, c));
    return map;
  }, [csvCustomers]);

  // Due date auto-fills from the selected customer's credit days.
  useEffect(() => {
    if (!form.customer_id) return;
    const customer = customersById.get(form.customer_id);
    if (!customer) return;
    const due = computeDueDate(form.invoice_date, customer.credit_days);
    setForm((current) => ({ ...current, due_date: due }));
  }, [form.customer_id, form.invoice_date, customersById]);

  function handleGroupInvoiceRows(rows: CsvRow[]) {
    return groupInvoiceRows(customersByCode, rows);
  }

  const customerNames = useMemo(() => {
    const names = invoices.map((inv) => inv.customer?.name).filter((n): n is string => Boolean(n));
    return Array.from(new Set(names)).sort();
  }, [invoices]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key as SortKey);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setInvoiceNoSearch("");
    setMinDate("");
    setMaxDate("");
    setMinDueDate("");
    setMaxDueDate("");
    setCustomerSearch("");
    setMinTotal("");
    setMaxTotal("");
    setMemoSearch("");
    setStatus("all");
  }

  const filtered = useMemo(() => {
    const invoiceNoQ = invoiceNoSearch.trim().toLowerCase();
    const customerQ = customerSearch.trim().toLowerCase();
    const memoQ = memoSearch.trim().toLowerCase();
    const min = minTotal.trim() ? Number(minTotal) : null;
    const max = maxTotal.trim() ? Number(maxTotal) : null;

    return invoices
      .filter((inv) => {
        const total = Number(inv.total);
        return (
          (!invoiceNoQ || inv.invoice_no.toLowerCase().includes(invoiceNoQ)) &&
          (!customerQ || (inv.customer?.name ?? "").toLowerCase().includes(customerQ)) &&
          (!memoQ || (inv.notes ?? "").toLowerCase().includes(memoQ)) &&
          (!minDate || inv.invoice_date >= minDate) &&
          (!maxDate || inv.invoice_date <= maxDate) &&
          (!minDueDate || inv.due_date >= minDueDate) &&
          (!maxDueDate || inv.due_date <= maxDueDate) &&
          (min === null || total >= min) &&
          (max === null || total <= max) &&
          (status === "all" || inv.status === status)
        );
      })
      .sort((a, b) => {
        const cmp = compareInvoices(a, b, sortKey);
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [
    invoices,
    invoiceNoSearch,
    customerSearch,
    memoSearch,
    minDate,
    maxDate,
    minDueDate,
    maxDueDate,
    minTotal,
    maxTotal,
    status,
    sortKey,
    sortDir,
  ]);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = Number(form.tax_amount) || 0;
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [form.items, form.tax_amount]);

  function openNewInvoiceForm() {
    setSelectedId(null);
    setForm(emptyInvoiceForm());
    setFormError(null);
    setShowForm(true);
  }

  function closeInvoiceForm() {
    setShowForm(false);
    setSelectedId(null);
    setForm(emptyInvoiceForm());
    setFormError(null);
  }

  async function openEditInvoiceForm(invoice: InvoiceRow) {
    if (!supabase) return;
    setShowForm(true);
    setFormLoading(true);
    setFormError(null);

    const { data, error } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("id", { ascending: true });

    if (error) {
      setFormError(error.message);
      toast.error(error.message);
      setFormLoading(false);
      return;
    }

    setSelectedId(invoice.id);
    setForm({
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
        })) ?? [{ ...EMPTY_LINE }],
    });
    setFormLoading(false);
  }

  function handleChangeItem(index: number, field: keyof InvoiceLine, value: string) {
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
  }

  function handleAddItem() {
    setForm((current) => ({ ...current, items: [...current.items, { ...EMPTY_LINE }] }));
  }

  function handleRemoveItem(index: number) {
    setForm((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((_, i) => i !== index) : [{ ...EMPTY_LINE }],
    }));
  }

  async function handleSaveInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setFormError(null);
    setSaving(true);

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

      const savedMsg = selectedId ? `Invoice ${form.invoice_no} updated.` : `Invoice ${form.invoice_no} created.`;
      toast.success(savedMsg);
      closeInvoiceForm();
      await loadInvoices();
    } catch (err) {
      const msg = (err as Error).message;
      setFormError(msg);
      toast.error(msg);
    }
    setSaving(false);
  }

  if (!isConfigured) return <NotConfigured />;

  if (loading) {
    return <TableSkeleton rows={8} />;
  }

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoice_no",
      header: "Number",
      sortable: true,
      render: (r) => (
        <Link href={`/invoices/${r.id}`} className="font-medium text-brand hover:underline">
          {r.invoice_no}
        </Link>
      ),
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Search invoice #</label>
          <input
            className={`${inputClass} w-full`}
            placeholder="e.g. INV-0007"
            value={invoiceNoSearch}
            onChange={(e) => setInvoiceNoSearch(e.target.value)}
            autoFocus
          />
        </div>
      ),
    },
    {
      key: "invoice_date",
      header: "Date",
      sortable: true,
      render: (r) => formatDate(r.invoice_date),
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
          <input type="date" className={inputClass} value={minDate} onChange={(e) => setMinDate(e.target.value)} />
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
          <input type="date" className={inputClass} value={maxDate} onChange={(e) => setMaxDate(e.target.value)} />
        </div>
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      sortable: true,
      render: (r) => formatDate(r.due_date),
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
          <input
            type="date"
            className={inputClass}
            value={minDueDate}
            onChange={(e) => setMinDueDate(e.target.value)}
          />
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
          <input
            type="date"
            className={inputClass}
            value={maxDueDate}
            onChange={(e) => setMaxDueDate(e.target.value)}
          />
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      sortable: true,
      render: (r) => r.customer?.name ?? "—",
      filter: (close) => {
        const matches = customerNames.filter((n) => n.toLowerCase().includes(customerSearch.toLowerCase()));
        return (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Search customer</label>
            <input
              className={`${inputClass} w-full`}
              placeholder="Type to search…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-40 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="px-1 py-1 text-xs text-slate-400">No matching customers.</p>
              ) : (
                matches.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setCustomerSearch(name);
                      close();
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
                  >
                    {name}
                  </button>
                ))
              )}
            </div>
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch("")}
                className="text-left text-xs font-medium text-brand hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: "total",
      header: "Total",
      sortable: true,
      className: "text-right w-32",
      render: (r) => money.format(Number(r.total)),
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Min total</label>
          <input
            type="number"
            className={inputClass}
            value={minTotal}
            onChange={(e) => setMinTotal(e.target.value)}
          />
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Max total</label>
          <input
            type="number"
            className={inputClass}
            value={maxTotal}
            onChange={(e) => setMaxTotal(e.target.value)}
          />
        </div>
      ),
    },
    {
      key: "notes",
      header: "Memo",
      sortable: true,
      render: (r) => r.notes ?? "—",
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Search memo</label>
          <input
            className={`${inputClass} w-full`}
            value={memoSearch}
            onChange={(e) => setMemoSearch(e.target.value)}
            autoFocus
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
      filter: (close) => (
        <div className="flex flex-col gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setStatus(f.value);
                close();
              }}
              className={`rounded px-2 py-1 text-left text-sm hover:bg-slate-100 ${
                status === f.value ? "bg-slate-100 font-medium text-slate-900" : ""
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <button
          type="button"
          onClick={() => openEditInvoiceForm(r)}
          className="text-sm font-medium text-brand hover:underline"
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Invoices"
        subtitle={`${filtered.length} of ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-4">
            <button type="button" onClick={clearFilters} className="text-sm font-medium text-brand hover:underline">
              Clear all filters
            </button>
            <button
              type="button"
              onClick={() => (showForm ? closeInvoiceForm() : openNewInvoiceForm())}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + New Invoice
            </button>
          </div>
        }
      />

      {showForm && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">
            {selectedId ? "Edit Invoice" : "New Invoice"}
          </h3>

          {formLoading ? (
            <p className="text-sm text-slate-400">Loading invoice…</p>
          ) : (
            <form onSubmit={handleSaveInvoice} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Invoice #">
                  <input
                    required
                    value={form.invoice_no}
                    onChange={(e) => setForm((f) => ({ ...f, invoice_no: e.target.value }))}
                    className={inputClass}
                    placeholder="INV-1001"
                  />
                </FormField>
                <FormField label="Customer">
                  <select
                    required
                    value={form.customer_id}
                    onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">— pick a customer —</option>
                    {csvCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Invoice date">
                  <input
                    required
                    type="date"
                    value={form.invoice_date}
                    onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Due date">
                  <input value={form.due_date} readOnly className={`${inputClass} bg-slate-100`} />
                </FormField>
                <FormField label="Tax amount">
                  <input
                    type="number"
                    min="0"
                    value={form.tax_amount}
                    onChange={(e) => setForm((f) => ({ ...f, tax_amount: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Notes">
                  <input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className={inputClass}
                    placeholder="Add any invoice notes here"
                  />
                </FormField>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Line items</p>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-sm font-medium text-brand hover:text-brand/80"
                  >
                    + Add item
                  </button>
                </div>
                <div className="space-y-4">
                  {form.items.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_auto]"
                    >
                      <FormField label="Description">
                        <input
                          value={item.description}
                          onChange={(e) => handleChangeItem(index, "description", e.target.value)}
                          className={inputClass}
                          placeholder="Item description"
                        />
                      </FormField>
                      <FormField label="Qty">
                        <input
                          type="number"
                          min="0"
                          value={item.qty}
                          onChange={(e) => handleChangeItem(index, "qty", e.target.value)}
                          className={inputClass}
                        />
                      </FormField>
                      <FormField label="Rate">
                        <input
                          type="number"
                          min="0"
                          value={item.rate}
                          onChange={(e) => handleChangeItem(index, "rate", e.target.value)}
                          className={inputClass}
                        />
                      </FormField>
                      <FormField label="Amount">
                        <input value={money.format(item.amount)} readOnly className={`${inputClass} bg-slate-100`} />
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

              <div className="flex justify-end">
                <div className="w-72 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Summary</p>
                  <div className="flex items-center justify-between py-1 text-slate-600">
                    <span>Subtotal</span>
                    <span>{money.format(totals.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-slate-600">
                    <span>Tax</span>
                    <span>{money.format(totals.taxAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{money.format(totals.total)}</span>
                  </div>
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : selectedId ? "Update Invoice" : "Save Invoice"}
                </button>
                <button
                  type="button"
                  onClick={closeInvoiceForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        empty="No invoices match your filters."
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />

      <div className="mt-6">
        <CsvImport
          title="Bulk import invoices"
          description="Download the sample CSV, add one row per line item (repeat the invoice_number to group lines under one invoice), then upload. Totals are calculated automatically. (Sales order #, item code, unit, discount, tax%, IGST/CGST/SGST and currency aren't tracked yet — only what's listed here is stored.)"
          templateFilename="invoices_template.csv"
          templateHeaders={INVOICE_CSV_TEMPLATE_HEADERS}
          templateSampleRows={INVOICE_CSV_TEMPLATE_SAMPLE_ROWS}
          groupRows={handleGroupInvoiceRows}
          onImport={importInvoices}
          onImported={loadInvoices}
        />
      </div>
    </div>
  );
}
