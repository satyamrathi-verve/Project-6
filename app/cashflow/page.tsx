"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { DataTable, type Column } from "@/components/DataTable";
import { inputClass } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { Skeleton, TableSkeleton } from "@/components/Skeleton";
import { isConfigured, supabase } from "@/lib/supabase";
import { outstandingOf, type InvoiceWithAllocations } from "@/lib/receivables";
import type { Customer } from "@/lib/types";

/*
  Cashflow Projection: expected collections from open invoices. Adjustments
  are local-state-only (no backend table for this) and reset on reload.

  Each invoice contributes up to two cash events: a primary portion (expected
  amount, on the expected date — both default to the invoice's outstanding /
  due date) and, if the expected amount is less than what's outstanding, a
  remaining portion that can be pushed out to a separate expected payment date.
*/

type InvoiceRow = InvoiceWithAllocations & { customerName: string };

type Adjustment = { expectedAmount?: number; expectedDate?: string; remainingDate?: string };

type DateBucket = { date: string; amount: number; cumulative: number };

type PivotRow = { id: string; customerName: string; invoiceNo: string; amounts: Record<string, number> };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CashflowPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, Adjustment>>({});
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [invoiceNoFilter, setInvoiceNoFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const [customerRes, invoiceRes] = await Promise.all([
        supabase.from("customers").select("*"),
        supabase
          .from("invoices")
          .select("*, receipt_allocations(amount)")
          .in("status", ["open", "partial", "overdue"])
          .order("due_date", { ascending: true }),
      ]);

      if (customerRes.error || invoiceRes.error) {
        setError(customerRes.error?.message ?? invoiceRes.error?.message ?? "Failed to load.");
        setLoading(false);
        return;
      }

      const customerMap = Object.fromEntries((customerRes.data as Customer[]).map((c) => [c.id, c.name]));
      const rows = (invoiceRes.data as InvoiceWithAllocations[]).map((inv) => ({
        ...inv,
        customerName: customerMap[inv.customer_id] ?? "Unknown",
      }));

      setInvoices(rows);
      setLoading(false);
    }

    load();
  }, []);

  function primaryAmount(inv: InvoiceRow) {
    const outstanding = outstandingOf(inv);
    const set = adjustments[inv.id]?.expectedAmount;
    return set === undefined ? outstanding : Math.min(set, outstanding);
  }

  function primaryDate(inv: InvoiceRow) {
    return adjustments[inv.id]?.expectedDate ?? inv.due_date;
  }

  function remainingAmount(inv: InvoiceRow) {
    return Math.max(0, outstandingOf(inv) - primaryAmount(inv));
  }

  function remainingDate(inv: InvoiceRow) {
    return adjustments[inv.id]?.remainingDate ?? primaryDate(inv);
  }

  function setAdjustment(id: string, patch: Adjustment) {
    setAdjustments((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function resetAdjustment(id: string) {
    setAdjustments((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  const activeInvoices = useMemo(() => invoices.filter((inv) => outstandingOf(inv) > 0), [invoices]);

  // Every invoice contributes a primary event, and (if split) a remaining event.
  const events = useMemo(() => {
    const list: { invoiceId: string; invoiceNo: string; customerName: string; date: string; amount: number }[] = [];
    for (const inv of activeInvoices) {
      const primAmt = primaryAmount(inv);
      if (primAmt > 0) {
        list.push({ invoiceId: inv.id, invoiceNo: inv.invoice_no, customerName: inv.customerName, date: primaryDate(inv), amount: primAmt });
      }
      const remAmt = remainingAmount(inv);
      if (remAmt > 0) {
        list.push({ invoiceId: inv.id, invoiceNo: inv.invoice_no, customerName: inv.customerName, date: remainingDate(inv), amount: remAmt });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInvoices, adjustments]);

  const dateBuckets = useMemo<DateBucket[]>(() => {
    const map = new Map<string, number>();
    for (const e of events) map.set(e.date, (map.get(e.date) ?? 0) + e.amount);
    const sortedDates = Array.from(map.keys()).sort();
    let cumulative = 0;
    return sortedDates.map((date) => {
      const amount = map.get(date)!;
      cumulative += amount;
      return { date, amount, cumulative };
    });
  }, [events]);

  const pivotRows = useMemo<PivotRow[]>(() => {
    const byInvoice = new Map<string, PivotRow>();
    for (const e of events) {
      let row = byInvoice.get(e.invoiceId);
      if (!row) {
        row = { id: e.invoiceId, customerName: e.customerName, invoiceNo: e.invoiceNo, amounts: {} };
        byInvoice.set(e.invoiceId, row);
      }
      row.amounts[e.date] = (row.amounts[e.date] ?? 0) + e.amount;
    }
    return Array.from(byInvoice.values()).sort(
      (a, b) => a.customerName.localeCompare(b.customerName) || a.invoiceNo.localeCompare(b.invoiceNo)
    );
  }, [events]);

  const filteredAdjustable = useMemo(() => {
    const invQ = invoiceNoFilter.trim().toLowerCase();
    const custQ = customerFilter.trim().toLowerCase();
    return activeInvoices.filter(
      (inv) =>
        (!invQ || inv.invoice_no.toLowerCase().includes(invQ)) &&
        (!custQ || inv.customerName.toLowerCase().includes(custQ))
    );
  }, [activeInvoices, invoiceNoFilter, customerFilter]);

  const colWidth = "w-[11%]";

  const invoiceColumns: Column<InvoiceRow>[] = [
    {
      key: "invoice_no",
      header: "Invoice #",
      className: colWidth,
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Search invoice #</label>
          <input
            className={`${inputClass} w-full`}
            placeholder="e.g. INV-0007"
            value={invoiceNoFilter}
            onChange={(e) => setInvoiceNoFilter(e.target.value)}
            autoFocus
          />
        </div>
      ),
    },
    {
      key: "customerName",
      header: "Customer",
      className: colWidth,
      filter: () => (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Search customer</label>
          <input
            className={`${inputClass} w-full`}
            placeholder="Type to search…"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            autoFocus
          />
        </div>
      ),
    },
    { key: "due_date", header: "Due Date", className: colWidth, render: (r) => formatDate(r.due_date) },
    {
      key: "outstanding",
      header: "Outstanding",
      className: `${colWidth} text-right`,
      render: (r) => money.format(outstandingOf(r)),
    },
    {
      key: "expectedDate",
      header: "Expected Date",
      className: colWidth,
      render: (r) => (
        <input
          type="date"
          value={primaryDate(r)}
          onChange={(e) => setAdjustment(r.id, { expectedDate: e.target.value })}
          className={`${inputClass} w-full py-1`}
        />
      ),
    },
    {
      key: "expectedAmount",
      header: "Expected Amount",
      className: colWidth,
      render: (r) => (
        <input
          type="number"
          min="0"
          max={outstandingOf(r)}
          value={primaryAmount(r)}
          onChange={(e) => setAdjustment(r.id, { expectedAmount: Number(e.target.value) || 0 })}
          className={`${inputClass} w-full py-1`}
        />
      ),
    },
    {
      key: "remainingAmount",
      header: "Remaining Payment",
      className: `${colWidth} text-right`,
      render: (r) => money.format(remainingAmount(r)),
    },
    {
      key: "remainingDate",
      header: "Expected Payment Date",
      className: colWidth,
      render: (r) => (
        <input
          type="date"
          disabled={remainingAmount(r) <= 0}
          value={remainingDate(r)}
          onChange={(e) => setAdjustment(r.id, { remainingDate: e.target.value })}
          className={`${inputClass} w-full py-1 disabled:cursor-not-allowed disabled:opacity-50`}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      className: colWidth,
      render: (r) =>
        adjustments[r.id] ? (
          <button type="button" onClick={() => resetAdjustment(r.id)} className="text-sm font-medium text-brand hover:text-brand/80">
            Reset
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cashflow Projection"
        subtitle="Expected collections from open invoices. Adjustments here aren't saved — they reset on reload."
        action={
          Object.keys(adjustments).length > 0 ? (
            <button
              type="button"
              onClick={() => setAdjustments({})}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              Reset all adjustments
            </button>
          ) : undefined
        }
      />

      {!isConfigured && <NotConfigured />}

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-72 w-full" />
          <TableSkeleton rows={5} />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-400">Daily Collection</p>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={dateBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tickFormatter={(v) => money.format(Number(v))} tick={{ fontSize: 11 }} width={80} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(v) => money.format(Number(v))}
                    labelFormatter={(d) => formatDate(String(d))}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="amount" fill="#244788" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-400">Cumulative Collections</p>
              <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={dateBuckets}>
                  <defs>
                    <linearGradient id="cumulativeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#244788" stopOpacity={0.1} />
                      <stop offset="100%" stopColor="#244788" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tickFormatter={(v) => money.format(Number(v))} tick={{ fontSize: 11 }} width={80} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(v) => money.format(Number(v))}
                    labelFormatter={(d) => formatDate(String(d))}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#244788"
                    strokeWidth={2}
                    fill="url(#cumulativeFill)"
                    dot={{ r: 3, fill: "#244788" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">Daily Projection</h3>
            <button
              type="button"
              onClick={() => setDetailExpanded((v) => !v)}
              className="text-sm font-medium text-brand hover:underline"
            >
              {detailExpanded ? "▾ Hide customer/invoice detail" : "▸ Show customer/invoice detail"}
            </button>
          </div>

          <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left">
                  <th className="sticky top-0 left-0 z-30 w-44 border-b border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">
                    Customer Name
                  </th>
                  <th className="sticky top-0 left-44 z-30 w-32 border-b border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">
                    Invoice No
                  </th>
                  {dateBuckets.map((d) => (
                    <th
                      key={d.date}
                      className="sticky top-0 z-20 w-32 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-400"
                    >
                      {formatDate(d.date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivotRows.length === 0 ? (
                  <tr>
                    <td colSpan={2 + dateBuckets.length} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                      No open invoices.
                    </td>
                  </tr>
                ) : detailExpanded ? (
                  pivotRows.map((row) => (
                    <tr key={row.id} className="group border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="sticky left-0 z-10 w-44 border-r border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800 px-4 py-3 text-slate-700 dark:text-slate-300 group-hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:group-hover:bg-slate-700/50">
                        {row.customerName}
                      </td>
                      <td className="sticky left-44 z-10 w-32 border-r border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800 px-4 py-3 text-slate-700 dark:text-slate-300 group-hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:group-hover:bg-slate-700/50">
                        {row.invoiceNo}
                      </td>
                      {dateBuckets.map((d) => (
                        <td key={d.date} className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                          {row.amounts[d.date] ? money.format(row.amounts[d.date]) : ""}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2 + dateBuckets.length} className="px-4 py-2 text-center text-xs text-slate-400 dark:text-slate-500">
                      {pivotRows.length} invoice{pivotRows.length === 1 ? "" : "s"} across{" "}
                      {new Set(pivotRows.map((r) => r.customerName)).size} customer(s) — click &ldquo;Show
                      customer/invoice detail&rdquo; to expand.
                    </td>
                  </tr>
                )}
              </tbody>
              {dateBuckets.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 font-semibold text-slate-900 dark:text-slate-100">
                    <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900/40 px-4 py-3" colSpan={2}>
                      Daily Collection
                    </td>
                    {dateBuckets.map((d) => (
                      <td key={d.date} className="px-4 py-3 text-right">
                        {money.format(d.amount)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 font-semibold text-slate-900 dark:text-slate-100">
                    <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900/40 px-4 py-3" colSpan={2}>
                      Cumulative Collections
                    </td>
                    {dateBuckets.map((d) => (
                      <td key={d.date} className="px-4 py-3 text-right">
                        {money.format(d.cumulative)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <h3 className="mb-2 mt-8 text-sm font-semibold text-slate-600 dark:text-slate-400">Adjust Expected Collections</h3>
          <DataTable
            columns={invoiceColumns}
            rows={filteredAdjustable}
            empty="No invoices match your filters."
            tableClassName="table-fixed"
          />
        </>
      )}
    </div>
  );
}
