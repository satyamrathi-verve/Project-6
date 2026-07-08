"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { isConfigured, supabase } from "@/lib/supabase";
import { outstandingOf, type InvoiceWithAllocations } from "@/lib/receivables";
import type { Customer } from "@/lib/types";

/*
  Dashboard: the at-a-glance home for the finance team. Tiles for customers,
  invoices, overdue count, total outstanding, plus a recent invoices table.
*/

type InvoiceRow = InvoiceWithAllocations & { customerName: string };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          .select("*, customers(name), receipt_allocations(amount)")
          .order("invoice_date", { ascending: false }),
      ]);

      if (customerRes.error || invoiceRes.error) {
        setError(customerRes.error?.message ?? invoiceRes.error?.message ?? "Failed to load.");
        setLoading(false);
        return;
      }

      setCustomers(customerRes.data as Customer[]);
      const rows = (invoiceRes.data as (InvoiceWithAllocations & { customers: { name: string } | null })[]).map((inv) => ({
        ...inv,
        customerName: inv.customers?.name ?? "Unknown",
      }));
      setInvoices(rows);
      setLoading(false);
    }

    load();
  }, []);

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

    return {
      totalCustomers: customers.length,
      totalInvoices: invoices.length,
      overdueCount,
      totalOutstanding,
    };
  }, [customers, invoices]);

  const recentInvoices = useMemo(() => invoices.slice(0, 8), [invoices]);

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoice_no",
      header: "Invoice #",
      render: (r) => (
        <Link href={`/invoices/${r.id}`} className="font-medium text-brand hover:underline">
          {r.invoice_no}
        </Link>
      ),
    },
    { key: "customerName", header: "Customer" },
    { key: "invoice_date", header: "Date", render: (r) => formatDate(r.invoice_date) },
    { key: "total", header: "Total", className: "text-right", render: (r) => money.format(Number(r.total)) },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(r.status)}`}>
          {r.status}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="At-a-glance overview of customers, invoices, and outstanding receivables." />

      {!isConfigured && <NotConfigured />}

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading dashboard...</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Total Customers" value={String(stats.totalCustomers)} />
            <StatTile label="Total Invoices" value={String(stats.totalInvoices)} />
            <StatTile
              label="Overdue Invoices"
              value={String(stats.overdueCount)}
              accent={stats.overdueCount > 0 ? "text-rose-600" : undefined}
            />
            <StatTile label="Total Outstanding" value={money.format(stats.totalOutstanding)} />
          </div>

          <h3 className="mb-2 text-sm font-semibold text-slate-600">Recent Invoices</h3>
          <DataTable columns={columns} rows={recentInvoices} empty="No invoices yet." />
        </>
      )}
    </div>
  );
}
