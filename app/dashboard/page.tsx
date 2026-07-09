"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { CardSkeleton } from "@/components/Skeleton";
import { isConfigured, supabase } from "@/lib/supabase";
import { outstandingOf } from "@/lib/receivables";
import type { Customer, Invoice, Receipt } from "@/lib/types";

/*
  Dashboard: the at-a-glance home for the finance team. Two headline cards
  (overdue invoices, total outstanding) plus four action-oriented sections
  that no single other report shows on its own: collections health this
  week, the accounts most worth chasing today, and two collections-speed
  KPIs (DSO and average collection period per customer).
*/

type Allocation = { amount: number; receipt: { receipt_date: string } | null };
type InvoiceRow = Invoice & { receipt_allocations?: Allocation[] | null };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const MS_PER_DAY = 86400000;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function monthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"week" | "month">("week");

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const [customerRes, invoiceRes, receiptRes] = await Promise.all([
        supabase.from("customers").select("*"),
        supabase.from("invoices").select("*, receipt_allocations(amount, receipt:receipts(receipt_date))"),
        supabase.from("receipts").select("*"),
      ]);

      if (customerRes.error || invoiceRes.error || receiptRes.error) {
        setError(
          customerRes.error?.message ?? invoiceRes.error?.message ?? receiptRes.error?.message ?? "Failed to load."
        );
        setLoading(false);
        return;
      }

      setCustomers(customerRes.data as Customer[]);
      setInvoices(invoiceRes.data as unknown as InvoiceRow[]);
      setReceipts(receiptRes.data as Receipt[]);
      setLoading(false);
    }

    load();
  }, []);

  const customerName = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? "Unknown";
  }, [customers]);

  const stats = useMemo(() => {
    const today = new Date();
    let overdueCount = 0;
    let totalOutstanding = 0;

    for (const inv of invoices) {
      if (inv.status === "paid") continue;
      const outstanding = outstandingOf(inv);
      if (outstanding <= 0) continue;
      totalOutstanding += outstanding;
      if (new Date(inv.due_date) < today) overdueCount++;
    }

    return { overdueCount, totalOutstanding };
  }, [invoices]);

  const collectionsHealth = useMemo(() => {
    const { start, end } = period === "week" ? weekRange() : monthRange();
    let expected = 0;
    for (const inv of invoices) {
      if (inv.status === "paid") continue;
      if (inv.due_date >= start && inv.due_date <= end) expected += outstandingOf(inv);
    }
    let actual = 0;
    for (const r of receipts) {
      if (r.receipt_date >= start && r.receipt_date <= end) actual += Number(r.amount);
    }
    return { expected, actual, start, end };
  }, [invoices, receipts, period]);

  const topOverdueCustomers = useMemo(() => {
    const today = new Date();
    const byCustomer = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status === "paid") continue;
      if (new Date(inv.due_date) >= today) continue;
      const outstanding = outstandingOf(inv);
      if (outstanding <= 0) continue;
      byCustomer.set(inv.customer_id, (byCustomer.get(inv.customer_id) ?? 0) + outstanding);
    }
    return Array.from(byCustomer.entries())
      .map(([customerId, amount]) => ({ customerId, name: customerName(customerId), amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [invoices, customerName]);

  const dso = useMemo(() => {
    function dsoAsOf(cutoff: Date) {
      const cutoffStr = toDateStr(cutoff);

      let outstanding = 0;
      for (const inv of invoices) {
        if (inv.invoice_date > cutoffStr) continue;
        const paidByCutoff = (inv.receipt_allocations ?? [])
          .filter((a) => a.receipt && a.receipt.receipt_date <= cutoffStr)
          .reduce((sum, a) => sum + Number(a.amount), 0);
        const remaining = Number(inv.total) - paidByCutoff;
        if (remaining > 0) outstanding += remaining;
      }

      let invoiced = 0;
      const windowStart = toDateStr(new Date(cutoff.getTime() - 30 * MS_PER_DAY));
      for (const inv of invoices) {
        if (inv.invoice_date >= windowStart && inv.invoice_date <= cutoffStr) invoiced += Number(inv.total);
      }

      return invoiced > 0 ? (outstanding / invoiced) * 30 : 0;
    }

    const current = dsoAsOf(new Date());
    const previous = dsoAsOf(daysAgo(30));
    return { current, previous, trend: current - previous };
  }, [invoices]);

  const avgCollectionPeriod = useMemo(() => {
    const byCustomer = new Map<string, { totalDays: number; count: number }>();

    for (const inv of invoices) {
      if (inv.status !== "paid") continue;
      const allocDates = (inv.receipt_allocations ?? [])
        .map((a) => a.receipt?.receipt_date)
        .filter((d): d is string => Boolean(d));
      if (allocDates.length === 0) continue;
      const paidDate = allocDates.sort().at(-1)!;
      const days = Math.max(0, Math.round((new Date(paidDate).getTime() - new Date(inv.invoice_date).getTime()) / MS_PER_DAY));

      const entry = byCustomer.get(inv.customer_id) ?? { totalDays: 0, count: 0 };
      entry.totalDays += days;
      entry.count += 1;
      byCustomer.set(inv.customer_id, entry);
    }

    return Array.from(byCustomer.entries())
      .map(([customerId, { totalDays, count }]) => ({
        customerId,
        name: customerName(customerId),
        avgDays: Math.round(totalDays / count),
      }))
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 5);
  }, [invoices, customerName]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="What needs attention today, not just a snapshot of the numbers." />

      {!isConfigured && <NotConfigured />}

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="space-y-6">
          <CardSkeleton count={2} />
          <div className="grid gap-6 lg:grid-cols-2">
            <CardSkeleton count={2} />
            <CardSkeleton count={2} />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatTile
              label="Overdue Invoices"
              value={String(stats.overdueCount)}
              accent={stats.overdueCount > 0 ? "text-rose-600" : undefined}
            />
            <StatTile label="Total Outstanding" value={money.format(stats.totalOutstanding)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-600">Collections Health</h3>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  {(["week", "month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        period === p ? "bg-brand text-white" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {p === "week" ? "This Week" : "This Month"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {collectionsHealth.start} to {collectionsHealth.end}
              </p>
              <div className="mt-4 flex items-end gap-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Expected</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{money.format(collectionsHealth.expected)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Collected</p>
                  <p
                    className={`mt-1 text-xl font-bold ${
                      collectionsHealth.actual >= collectionsHealth.expected ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {money.format(collectionsHealth.actual)}
                  </p>
                </div>
              </div>
              <Link href="/cashflow" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
                View Cashflow Projection →
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
              <h3 className="text-sm font-semibold text-slate-600">Top 5 Overdue Customers</h3>
              {topOverdueCustomers.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">No overdue customers right now.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {topOverdueCustomers.map((c) => (
                    <li key={c.customerId} className="flex items-center justify-between py-2">
                      <Link href="/reports/ageing" className="text-sm font-medium text-brand hover:underline">
                        {c.name}
                      </Link>
                      <span className="text-sm font-semibold text-rose-600">{money.format(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/reports/ageing" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
                View AR Ageing →
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
              <h3 className="text-sm font-semibold text-slate-600">DSO — Days Sales Outstanding</h3>
              <p className="mt-1 text-xs text-slate-400">30-day trailing window</p>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-3xl font-bold text-slate-900">{dso.current.toFixed(1)}</p>
                <p className="text-sm text-slate-500">days</p>
                <span
                  className={`ml-2 text-sm font-semibold ${
                    dso.trend > 0 ? "text-rose-600" : dso.trend < 0 ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {dso.trend > 0 ? "▲" : dso.trend < 0 ? "▼" : "–"} {Math.abs(dso.trend).toFixed(1)} vs 30 days ago
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
              <h3 className="text-sm font-semibold text-slate-600">Average Collection Period by Customer</h3>
              <p className="mt-1 text-xs text-slate-400">Slowest 5 payers, average days from invoice to payment</p>
              {avgCollectionPeriod.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">No paid invoices yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {avgCollectionPeriod.map((c) => (
                    <li key={c.customerId} className="flex items-center justify-between py-2">
                      <Link href="/reports/statement" className="text-sm font-medium text-brand hover:underline">
                        {c.name}
                      </Link>
                      <span className="text-sm font-semibold text-slate-700">{c.avgDays} days</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
