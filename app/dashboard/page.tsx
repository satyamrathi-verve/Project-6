"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
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

type TrendPoint = { date: string; value: number };

// Stat-tile sparkline: the historical line stays in a de-emphasis hue (it's
// context, not the headline), and only the current/last point is drawn in
// the direction color — good (declining) vs bad (rising) — so the reader's
// eye lands on "where things are now," not the whole shape.
function Sparkline({
  data,
  color,
  formatValue,
}: {
  data: TrendPoint[];
  color: string;
  formatValue: (value: number) => string;
}) {
  return (
    <div className="h-8 w-20 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Tooltip
            cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as TrendPoint;
              return (
                <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{formatValue(point.value)}</p>
                  <p className="text-slate-400 dark:text-slate-500">{formatDate(point.date)}</p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#94a3b8"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) => {
              const isLast = props.index === data.length - 1;
              return isLast ? (
                <circle
                  key="current"
                  cx={props.cx}
                  cy={props.cy}
                  r={3}
                  fill={color}
                  stroke="var(--sparkline-surface, #fff)"
                  strokeWidth={1.5}
                />
              ) : (
                <g key={`pt-${props.index}`} />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function StatTile({
  label,
  value,
  accent,
  delta,
  trend,
  trendColor,
  formatTrendValue,
}: {
  label: string;
  value: string;
  accent?: string;
  /** Signed change vs a named period, e.g. "▲ 3 vs last week". */
  delta?: { text: string; color: string };
  trend?: TrendPoint[];
  trendColor?: string;
  formatTrendValue?: (value: number) => string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`mt-1 text-lg font-bold ${accent ?? "text-slate-900 dark:text-slate-100"}`}>{value}</p>
          {delta && <p className={`mt-1 text-xs font-semibold ${delta.color}`}>{delta.text}</p>}
        </div>
        {trend && trend.length > 1 && (
          <Sparkline data={trend} color={trendColor ?? "#244788"} formatValue={formatTrendValue ?? String} />
        )}
      </div>
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

  // Retrospective weekly snapshots (8 points, ~7 weeks back to today) computed
  // the same way DSO already does below — replaying each invoice's payment
  // history as of a past cutoff date, since there's no daily snapshot table.
  const weeklyHistory = useMemo(() => {
    function snapshotAsOf(cutoff: Date) {
      const cutoffStr = toDateStr(cutoff);
      let outstanding = 0;
      let overdueCount = 0;
      for (const inv of invoices) {
        if (inv.invoice_date > cutoffStr) continue;
        const paidByCutoff = (inv.receipt_allocations ?? [])
          .filter((a) => a.receipt && a.receipt.receipt_date <= cutoffStr)
          .reduce((sum, a) => sum + Number(a.amount), 0);
        const remaining = Number(inv.total) - paidByCutoff;
        if (remaining > 0) {
          outstanding += remaining;
          if (inv.due_date < cutoffStr) overdueCount++;
        }
      }
      return { outstanding, overdueCount };
    }

    const points: { date: string; outstanding: number; overdueCount: number }[] = [];
    for (let weeksAgo = 7; weeksAgo >= 0; weeksAgo--) {
      const cutoff = daysAgo(weeksAgo * 7);
      points.push({ date: toDateStr(cutoff), ...snapshotAsOf(cutoff) });
    }
    return points;
  }, [invoices]);

  const outstandingTrend = useMemo(
    () => weeklyHistory.map((p) => ({ date: p.date, value: p.outstanding })),
    [weeklyHistory]
  );
  const overdueTrend = useMemo(
    () => weeklyHistory.map((p) => ({ date: p.date, value: p.overdueCount })),
    [weeklyHistory]
  );

  const lastWeek = weeklyHistory.at(-2);

  // Both metrics share the same direction convention: less is better.
  function directionStyle(diff: number): { textClass: string; hex: string } {
    if (diff === 0) return { textClass: "text-slate-400 dark:text-slate-500", hex: "#94a3b8" };
    return diff < 0
      ? { textClass: "text-emerald-600 dark:text-emerald-400", hex: "#059669" }
      : { textClass: "text-rose-600 dark:text-rose-400", hex: "#e11d48" };
  }

  const overdueDelta = useMemo(() => {
    if (!lastWeek) return null;
    const diff = stats.overdueCount - lastWeek.overdueCount;
    const { textClass, hex } = directionStyle(diff);
    const text = diff === 0 ? "No change vs last week" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)} vs last week`;
    return { text, color: textClass, hex };
  }, [stats.overdueCount, lastWeek]);

  const outstandingDelta = useMemo(() => {
    if (!lastWeek) return null;
    const diff = stats.totalOutstanding - lastWeek.outstanding;
    const { textClass, hex } = directionStyle(Math.abs(diff) < 1 ? 0 : diff);
    const text =
      Math.abs(diff) < 1 ? "No change vs last week" : `${diff > 0 ? "▲" : "▼"} ${money.format(Math.abs(diff))} vs last week`;
    return { text, color: textClass, hex };
  }, [stats.totalOutstanding, lastWeek]);

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
              delta={overdueDelta ?? undefined}
              trend={overdueTrend}
              trendColor={overdueDelta?.hex}
            />
            <StatTile
              label="Total Outstanding"
              value={money.format(stats.totalOutstanding)}
              delta={outstandingDelta ?? undefined}
              trend={outstandingTrend}
              trendColor={outstandingDelta?.hex}
              formatTrendValue={(v) => money.format(v)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">Collections Health</h3>
                <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-700 p-1">
                  {(["week", "month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        period === p ? "bg-brand text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      {p === "week" ? "This Week" : "This Month"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {collectionsHealth.start} to {collectionsHealth.end}
              </p>
              <div className="mt-4 flex items-end gap-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Expected</p>
                  <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{money.format(collectionsHealth.expected)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Collected</p>
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

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 transition-shadow hover:shadow-md">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">Top 5 Overdue Customers</h3>
              {topOverdueCustomers.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">No overdue customers right now.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700/60">
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

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 transition-shadow hover:shadow-md">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">DSO — Days Sales Outstanding</h3>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">30-day trailing window</p>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{dso.current.toFixed(1)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">days</p>
                <span
                  className={`ml-2 text-sm font-semibold ${
                    dso.trend > 0 ? "text-rose-600" : dso.trend < 0 ? "text-emerald-600" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {dso.trend > 0 ? "▲" : dso.trend < 0 ? "▼" : "–"} {Math.abs(dso.trend).toFixed(1)} vs 30 days ago
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 transition-shadow hover:shadow-md">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">Average Collection Period by Customer</h3>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Slowest {avgCollectionPeriod.length} payer{avgCollectionPeriod.length === 1 ? "" : "s"}, average days from invoice to payment
              </p>
              {avgCollectionPeriod.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">No paid invoices yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700/60">
                  {avgCollectionPeriod.map((c) => (
                    <li key={c.customerId} className="flex items-center justify-between py-2">
                      <Link
                        href={`/reports/statement?customer=${c.customerId}`}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{c.avgDays} days</span>
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
