"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { DataTable, type Column } from "@/components/DataTable";
import { NotConfigured } from "@/components/NotConfigured";
import { StatusBadge } from "@/components/StatusBadge";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import type { Customer, Invoice, InvoiceStatus, Receipt, ReceiptMode } from "@/lib/types";

/*
  Collections — Receipt Entry: record a payment and allocate it against one or
  more of the customer's open invoices. Each allocated invoice's outstanding
  goes down; it flips to "paid" once fully settled, otherwise stays
  partial/overdue depending on its due date.
*/

const MODES: { value: ReceiptMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "neft", label: "NEFT" },
];

const MODE_FILTERS: { value: ReceiptMode | "all"; label: string }[] = [
  { value: "all", label: "All modes" },
  ...MODES,
];

const EPSILON = 0.01;
const today = () => new Date().toISOString().slice(0, 10);

type InvoiceWithAllocations = Invoice & { allocations: { amount: number }[] };
type OpenInvoice = Invoice & { outstanding: number };
type ReceiptRow = Receipt & { customer: { name: string } | null };
type ReceiptSortKey = "receipt_no" | "receipt_date" | "customer" | "amount" | "mode" | "reference";

function emptyForm() {
  return {
    receipt_no: "",
    receipt_date: today(),
    customer_id: "",
    amount: "",
    mode: "neft" as ReceiptMode,
    reference: "",
  };
}

function compareReceipts(a: ReceiptRow, b: ReceiptRow, key: ReceiptSortKey): number {
  switch (key) {
    case "receipt_no":
      return a.receipt_no.localeCompare(b.receipt_no);
    case "receipt_date":
      return a.receipt_date.localeCompare(b.receipt_date);
    case "customer":
      return (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "");
    case "amount":
      return Number(a.amount) - Number(b.amount);
    case "mode":
      return a.mode.localeCompare(b.mode);
    case "reference":
      return (a.reference ?? "").localeCompare(b.reference ?? "");
  }
}

export default function ReceiptEntryPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptRow[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Recent Receipts filters/sort
  const [receiptNoSearch, setReceiptNoSearch] = useState("");
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [modeFilter, setModeFilter] = useState<ReceiptMode | "all">("all");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [sortKey, setSortKey] = useState<ReceiptSortKey>("receipt_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  async function loadRecentReceipts() {
    if (!supabase) return;
    const { data } = await supabase
      .from("receipts")
      .select("*, customer:customers(name)")
      .order("created_at", { ascending: false });
    setRecentReceipts((data as unknown as ReceiptRow[]) ?? []);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;

    async function load() {
      const { data: custs } = await client.from("customers").select("*").order("name", { ascending: true });
      setCustomers((custs as Customer[]) ?? []);
      await loadRecentReceipts();
      setLoading(false);
    }

    load();
  }, []);

  async function loadOpenInvoices(customerId: string) {
    if (!supabase || !customerId) {
      setOpenInvoices([]);
      return;
    }
    setLoadingInvoices(true);

    const { data } = await supabase
      .from("invoices")
      .select("*, allocations:receipt_allocations(amount)")
      .eq("customer_id", customerId)
      .neq("status", "paid")
      .order("due_date", { ascending: true });

    const rows = ((data as unknown as InvoiceWithAllocations[]) ?? [])
      .map((inv) => {
        const received = inv.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
        return { ...inv, outstanding: Number(inv.total) - received } as OpenInvoice;
      })
      .filter((inv) => inv.outstanding > EPSILON);

    setOpenInvoices(rows);
    setAllocations({});
    setLoadingInvoices(false);
  }

  function handleCustomerChange(customerId: string) {
    setForm((f) => ({ ...f, customer_id: customerId }));
    loadOpenInvoices(customerId);
  }

  function setAllocation(invoiceId: string, value: string) {
    setAllocations((a) => ({ ...a, [invoiceId]: value }));
  }

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocations]
  );

  const receiptAmount = Number(form.amount) || 0;
  const unallocated = receiptAmount - totalAllocated;

  function autoAllocate() {
    let remaining = receiptAmount;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (remaining <= EPSILON) break;
      const take = Math.min(inv.outstanding, remaining);
      next[inv.id] = take.toFixed(2);
      remaining -= take;
    }
    setAllocations(next);
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm());
    setAllocations({});
    setOpenInvoices([]);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setSuccessMsg(null);

    if (!form.receipt_no.trim() || !form.customer_id || receiptAmount <= 0) {
      setError("Receipt No, customer, and a positive amount are required.");
      return;
    }
    if (totalAllocated <= EPSILON) {
      setError("Allocate the receipt to at least one open invoice.");
      return;
    }
    if (totalAllocated > receiptAmount + EPSILON) {
      setError("You've allocated more than the receipt amount.");
      return;
    }

    setSaving(true);
    try {
      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({
          receipt_no: form.receipt_no.trim(),
          receipt_date: form.receipt_date,
          customer_id: form.customer_id,
          amount: receiptAmount,
          mode: form.mode,
          reference: form.reference.trim() || null,
        })
        .select("*")
        .single();
      if (receiptError || !receipt) throw receiptError ?? new Error("Could not save receipt.");

      const toAllocate = openInvoices
        .map((inv) => ({ inv, amt: Number(allocations[inv.id]) || 0 }))
        .filter(({ amt }) => amt > EPSILON);

      const { error: allocError } = await supabase
        .from("receipt_allocations")
        .insert(toAllocate.map(({ inv, amt }) => ({ receipt_id: receipt.id, invoice_id: inv.id, amount: amt })));
      if (allocError) throw allocError;

      const todayStr = today();
      for (const { inv, amt } of toAllocate) {
        const newOutstanding = inv.outstanding - amt;
        const newStatus: InvoiceStatus =
          newOutstanding <= EPSILON ? "paid" : inv.due_date < todayStr ? "overdue" : "partial";
        const { error: updateError } = await supabase.from("invoices").update({ status: newStatus }).eq("id", inv.id);
        if (updateError) throw updateError;
      }

      setSuccessMsg(
        `Receipt ${receipt.receipt_no} saved and allocated to ${toAllocate.length} invoice${
          toAllocate.length === 1 ? "" : "s"
        }.`
      );
      setForm(emptyForm());
      setAllocations({});
      setOpenInvoices([]);
      await loadRecentReceipts();
    } catch (err) {
      setError((err as Error).message);
    }
    setSaving(false);
  }

  const customerNames = useMemo(() => customers.map((c) => c.name).sort(), [customers]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key as ReceiptSortKey);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setReceiptNoSearch("");
    setMinDate("");
    setMaxDate("");
    setCustomerFilter("");
    setMinAmount("");
    setMaxAmount("");
    setModeFilter("all");
    setReferenceSearch("");
  }

  const filteredReceipts = useMemo(() => {
    const receiptNoQ = receiptNoSearch.trim().toLowerCase();
    const customerQ = customerFilter.trim().toLowerCase();
    const referenceQ = referenceSearch.trim().toLowerCase();
    const min = minAmount.trim() ? Number(minAmount) : null;
    const max = maxAmount.trim() ? Number(maxAmount) : null;

    return recentReceipts
      .filter((r) => {
        const amount = Number(r.amount);
        return (
          (!receiptNoQ || r.receipt_no.toLowerCase().includes(receiptNoQ)) &&
          (!customerQ || (r.customer?.name ?? "").toLowerCase().includes(customerQ)) &&
          (!referenceQ || (r.reference ?? "").toLowerCase().includes(referenceQ)) &&
          (!minDate || r.receipt_date >= minDate) &&
          (!maxDate || r.receipt_date <= maxDate) &&
          (min === null || amount >= min) &&
          (max === null || amount <= max) &&
          (modeFilter === "all" || r.mode === modeFilter)
        );
      })
      .sort((a, b) => {
        const cmp = compareReceipts(a, b, sortKey);
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [
    recentReceipts,
    receiptNoSearch,
    customerFilter,
    referenceSearch,
    minDate,
    maxDate,
    minAmount,
    maxAmount,
    modeFilter,
    sortKey,
    sortDir,
  ]);

  if (!isConfigured) return <NotConfigured />;
  if (loading) return <p className="py-10 text-center text-slate-400">Loading…</p>;

  const invoiceColumns: Column<OpenInvoice>[] = [
    { key: "invoice_no", header: "Invoice #" },
    { key: "due_date", header: "Due", render: (r) => formatDate(r.due_date) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "total", header: "Total", className: "text-right", render: (r) => money.format(Number(r.total)) },
    {
      key: "outstanding",
      header: "Outstanding",
      className: "text-right",
      render: (r) => money.format(r.outstanding),
    },
    {
      key: "allocate",
      header: "Allocate",
      className: "w-36",
      render: (r) => (
        <input
          type="number"
          min="0"
          step="0.01"
          max={r.outstanding}
          className={`${inputClass} w-32`}
          value={allocations[r.id] ?? ""}
          onChange={(e) => setAllocation(r.id, e.target.value)}
          placeholder="0.00"
        />
      ),
    },
  ];

  const receiptColumns: Column<ReceiptRow>[] = [
    {
      key: "receipt_no",
      header: "Receipt No",
      sortable: true,
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Search receipt no</label>
          <input
            className={`${inputClass} w-full`}
            value={receiptNoSearch}
            onChange={(e) => setReceiptNoSearch(e.target.value)}
            autoFocus
          />
        </div>
      ),
    },
    {
      key: "receipt_date",
      header: "Date",
      sortable: true,
      render: (r) => formatDate(r.receipt_date),
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
      key: "customer",
      header: "Customer",
      sortable: true,
      render: (r) => r.customer?.name ?? "—",
      filter: (close) => {
        const matches = customerNames.filter((n) => n.toLowerCase().includes(customerFilter.toLowerCase()));
        return (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Search customer</label>
            <input
              className={`${inputClass} w-full`}
              placeholder="Type to search…"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
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
                      setCustomerFilter(name);
                      close();
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
                  >
                    {name}
                  </button>
                ))
              )}
            </div>
            {customerFilter && (
              <button
                type="button"
                onClick={() => setCustomerFilter("")}
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
      key: "amount",
      header: "Amount",
      sortable: true,
      className: "text-right",
      render: (r) => money.format(Number(r.amount)),
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Min amount</label>
          <input
            type="number"
            className={inputClass}
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Max amount</label>
          <input
            type="number"
            className={inputClass}
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </div>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      sortable: true,
      render: (r) => <span className="uppercase">{r.mode}</span>,
      filter: (close) => (
        <div className="flex flex-col gap-1">
          {MODE_FILTERS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => {
                setModeFilter(m.value);
                close();
              }}
              className={`rounded px-2 py-1 text-left text-sm hover:bg-slate-100 ${
                modeFilter === m.value ? "bg-slate-100 font-medium text-slate-900" : ""
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      key: "reference",
      header: "Reference",
      sortable: true,
      render: (r) => r.reference ?? "—",
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Search reference</label>
          <input
            className={`${inputClass} w-full`}
            value={referenceSearch}
            onChange={(e) => setReferenceSearch(e.target.value)}
            autoFocus
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Receipt Entry"
        subtitle="Record money received and knock it off open invoices."
        action={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + New Receipt
          </button>
        }
      />

      {showForm && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">New Receipt</h3>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Receipt No">
                <input
                  required
                  value={form.receipt_no}
                  onChange={(e) => setForm((f) => ({ ...f, receipt_no: e.target.value }))}
                  className={inputClass}
                  placeholder="RCP-0041"
                />
              </FormField>
              <FormField label="Date">
                <input
                  required
                  type="date"
                  value={form.receipt_date}
                  onChange={(e) => setForm((f) => ({ ...f, receipt_date: e.target.value }))}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Customer">
                <select
                  required
                  value={form.customer_id}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— pick a customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Amount received (₹)">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className={inputClass}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Mode">
                <select
                  value={form.mode}
                  onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as ReceiptMode }))}
                  className={inputClass}
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Reference (cheque no / UTR...)">
                <input
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  className={inputClass}
                  placeholder="Cheque no / UTR…"
                />
              </FormField>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">Allocate against open invoices</h4>
                  <p className="text-sm text-slate-500">
                    {form.customer_id
                      ? "Pick how much of this receipt pays off each invoice."
                      : "Select a customer to see their open invoices."}
                  </p>
                </div>
                {openInvoices.length > 0 && (
                  <button
                    type="button"
                    onClick={autoAllocate}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Auto-allocate oldest first
                  </button>
                )}
              </div>

              {loadingInvoices ? (
                <p className="text-sm text-slate-400">Loading invoices…</p>
              ) : form.customer_id ? (
                <>
                  <DataTable
                    columns={invoiceColumns}
                    rows={openInvoices}
                    empty="This customer has no open invoices."
                  />
                  {openInvoices.length > 0 && (
                    <div className="mt-3 flex justify-end gap-6 text-sm">
                      <span className="text-slate-500">
                        Allocated:{" "}
                        <span className="font-semibold text-slate-900">{money.format(totalAllocated)}</span>
                      </span>
                      <span className={unallocated < -EPSILON ? "text-red-600" : "text-slate-500"}>
                        Unallocated: <span className="font-semibold">{money.format(unallocated)}</span>
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">No customer selected yet.</p>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {successMsg && <p className="text-sm text-green-700">{successMsg}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Receipt"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="mb-2 mt-8 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600">Recent Receipts</h3>
        <button type="button" onClick={clearFilters} className="text-sm font-medium text-brand hover:underline">
          Clear all filters
        </button>
      </div>
      <DataTable
        columns={receiptColumns}
        rows={filteredReceipts}
        empty="No receipts match your filters."
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />
    </div>
  );
}
