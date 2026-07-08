"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { isConfigured, supabase } from "@/lib/supabase";
import { outstandingOf, type InvoiceWithAllocations } from "@/lib/receivables";
import type { Customer } from "@/lib/types";

/*
  Cashflow Projection: expected collections from open invoices, grouped by
  week. Adjustments are local-state-only (no backend table for this) and
  reset on reload.
*/

type InvoiceRow = InvoiceWithAllocations & { customerName: string };

type Adjustment = { expectedAmount?: number; expectedDate?: string };

type WeekRow = {
  id: string;
  weekStart: string;
  amount: number;
  cumulative: number;
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function weekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function CashflowPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, Adjustment>>({});

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

  function effectiveAmount(inv: InvoiceRow) {
    return adjustments[inv.id]?.expectedAmount ?? outstandingOf(inv);
  }

  function effectiveDate(inv: InvoiceRow) {
    return adjustments[inv.id]?.expectedDate ?? inv.due_date;
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

  const weeks = useMemo<WeekRow[]>(() => {
    const map = new Map<string, number>();
    for (const inv of activeInvoices) {
      const wk = weekStart(effectiveDate(inv));
      map.set(wk, (map.get(wk) ?? 0) + effectiveAmount(inv));
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    let cumulative = 0;
    return sorted.map(([wk, amount]) => {
      cumulative += amount;
      return { id: wk, weekStart: wk, amount, cumulative };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInvoices, adjustments]);

  const weekColumns: Column<WeekRow>[] = [
    { key: "weekStart", header: "Week Of", render: (r) => formatDate(r.weekStart) },
    { key: "amount", header: "Projected Amount", className: "text-right", render: (r) => money.format(r.amount) },
    { key: "cumulative", header: "Running Total", className: "text-right font-semibold", render: (r) => money.format(r.cumulative) },
  ];

  const invoiceColumns: Column<InvoiceRow>[] = [
    { key: "invoice_no", header: "Invoice #" },
    { key: "customerName", header: "Customer" },
    { key: "due_date", header: "Due Date", render: (r) => formatDate(r.due_date) },
    { key: "outstanding", header: "Outstanding", className: "text-right", render: (r) => money.format(outstandingOf(r)) },
    {
      key: "expectedDate",
      header: "Expected Date",
      render: (r) => (
        <input
          type="date"
          value={effectiveDate(r)}
          onChange={(e) => setAdjustment(r.id, { expectedDate: e.target.value })}
          className={`${inputClass} py-1`}
        />
      ),
    },
    {
      key: "expectedAmount",
      header: "Expected Amount",
      render: (r) => (
        <input
          type="number"
          min="0"
          value={effectiveAmount(r)}
          onChange={(e) => setAdjustment(r.id, { expectedAmount: Number(e.target.value) || 0 })}
          className={`${inputClass} py-1`}
        />
      ),
    },
    {
      key: "actions",
      header: "",
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
        subtitle="Expected collections from open invoices, grouped by week. Adjustments here aren't saved — they reset on reload."
        action={
          Object.keys(adjustments).length > 0 ? (
            <button
              type="button"
              onClick={() => setAdjustments({})}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset all adjustments
            </button>
          ) : undefined
        }
      />

      {!isConfigured && <NotConfigured />}

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading projection...</div>
      ) : (
        <>
          <div className="mb-6 h-72 rounded-xl border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="weekStart" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => money.format(Number(v))} tick={{ fontSize: 12 }} width={90} />
                <Tooltip
                  formatter={(v) => money.format(Number(v))}
                  labelFormatter={(d) => `Week of ${formatDate(String(d))}`}
                />
                <Bar dataKey="amount" fill="#2f6bff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-slate-600">Weekly Projection</h3>
          <DataTable columns={weekColumns} rows={weeks} empty="No open invoices." />

          <h3 className="mb-2 mt-8 text-sm font-semibold text-slate-600">Adjust Expected Collections</h3>
          <DataTable columns={invoiceColumns} rows={activeInvoices} empty="No open invoices." />
        </>
      )}
    </div>
  );
}
