"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { DataTable, type Column } from "@/components/DataTable";
import { NotConfigured } from "@/components/NotConfigured";
import { TableSkeleton } from "@/components/Skeleton";
import { PrintHeader } from "@/components/PrintHeader";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import type { Customer, Invoice, Receipt } from "@/lib/types";

/*
  Customer Statement (ledger): every invoice (a debit) and every receipt (a
  credit) for one customer, in date order, with a running balance and the
  closing amount they still owe. The "Invoice details" / "Payment details"
  filter only hides rows of the other type — the running balance shown on
  each row always reflects the true balance across the full combined
  timeline, not a total recomputed from just the visible rows. Otherwise an
  invoice-only view would just show "total billed" instead of "amount owed".
*/

type LedgerEntry = {
  id: string;
  date: string;
  type: "invoice" | "receipt";
  reference: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

type FilterValue = "all" | "invoices" | "payments";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "invoices", label: "Invoice details" },
  { value: "payments", label: "Payment details" },
];

export default function CustomerStatementPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError(fetchError.message);
        else setCustomers((data as Customer[]) ?? []);
      });
  }, []);

  useEffect(() => {
    if (!supabase || !customerId) {
      setInvoices([]);
      setReceipts([]);
      return;
    }

    const client = supabase;
    setLoading(true);
    setError(null);

    Promise.all([
      client.from("invoices").select("*").eq("customer_id", customerId).order("invoice_date", { ascending: true }),
      client.from("receipts").select("*").eq("customer_id", customerId).order("receipt_date", { ascending: true }),
    ]).then(([invoiceRes, receiptRes]) => {
      if (invoiceRes.error) setError(invoiceRes.error.message);
      else setInvoices(invoiceRes.data as Invoice[]);

      if (receiptRes.error) setError(receiptRes.error.message);
      else setReceipts(receiptRes.data as Receipt[]);

      setLoading(false);
    });
  }, [customerId]);

  const customer = customers.find((c) => c.id === customerId) ?? null;

  const ledger = useMemo<LedgerEntry[]>(() => {
    const openingBalance = customer?.opening_balance ?? 0;

    const entries: Omit<LedgerEntry, "runningBalance">[] = [
      ...invoices.map((inv) => ({
        id: `invoice-${inv.id}`,
        date: inv.invoice_date,
        type: "invoice" as const,
        reference: inv.invoice_no,
        debit: Number(inv.total),
        credit: 0,
      })),
      ...receipts.map((r) => ({
        id: `receipt-${r.id}`,
        date: r.receipt_date,
        type: "receipt" as const,
        reference: r.receipt_no,
        debit: 0,
        credit: Number(r.amount),
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let runningBalance = openingBalance;
    return entries.map((entry) => {
      runningBalance += entry.debit - entry.credit;
      return { ...entry, runningBalance };
    });
  }, [invoices, receipts, customer]);

  const closingBalance = ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : customer?.opening_balance ?? 0;

  const visibleRows = useMemo(() => {
    if (filter === "invoices") return ledger.filter((e) => e.type === "invoice");
    if (filter === "payments") return ledger.filter((e) => e.type === "receipt");
    return ledger;
  }, [ledger, filter]);

  const columns: Column<LedgerEntry>[] = [
    { key: "date", header: "Date", render: (r) => formatDate(r.date) },
    { key: "reference", header: "Reference" },
    {
      key: "debit",
      header: "Invoice (Dr)",
      className: "text-right",
      render: (r) => (r.debit > 0 ? money.format(r.debit) : "—"),
    },
    {
      key: "credit",
      header: "Payment (Cr)",
      className: "text-right",
      render: (r) => (r.credit > 0 ? money.format(r.credit) : "—"),
    },
    {
      key: "runningBalance",
      header: "Running Balance",
      className: "text-right font-medium",
      render: (r) => money.format(r.runningBalance),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customer Statement"
        subtitle="Pick a customer to see their running account — every invoice and payment in date order."
        action={
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 print:hidden"
          >
            Print
          </button>
        }
      />

      <PrintHeader title={customer ? `Customer Statement — ${customer.name}` : "Customer Statement"} />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-4 print:hidden">
            <FormField label="Customer">
              <select
                className={`${inputClass} min-w-[260px]`}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </FormField>

            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    filter === f.value
                      ? "border-brand bg-brand text-white"
                      : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          {!customerId ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-6 text-sm text-slate-500 dark:text-slate-400">
              Select a customer above to view their statement.
            </div>
          ) : loading ? (
            <TableSkeleton rows={6} />
          ) : (
            <div className="print:overflow-visible">
              {customer && (
                <div className="mb-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>
                    Opening balance: <span className="font-medium text-slate-900 dark:text-slate-100">{money.format(customer.opening_balance)}</span>
                  </span>
                </div>
              )}

              <DataTable
                columns={columns}
                rows={visibleRows}
                empty="No transactions for this customer yet."
                footerRow={
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 font-semibold text-slate-900 dark:text-slate-100">
                    <td className="px-4 py-3" colSpan={4}>
                      Closing balance (amount outstanding)
                    </td>
                    <td className="px-4 py-3 text-right">{money.format(closingBalance)}</td>
                  </tr>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
