"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { Modal } from "@/components/Modal";
import { TableSkeleton } from "@/components/Skeleton";
import { PrintHeader } from "@/components/PrintHeader";
import { isConfigured, supabase } from "@/lib/supabase";
import { outstandingOf, type InvoiceWithAllocations } from "@/lib/receivables";
import type { Customer } from "@/lib/types";

/*
  AR Ageing report: one row per customer, outstanding split into age buckets
  by how overdue each invoice's due date is. Read-only, printable.
*/

type Bucket = "notDue" | "b0_30" | "b31_60" | "b61_90" | "b90plus";

type AgeingRow = {
  id: string;
  name: string;
  notDue: number;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b90plus: number;
  total: number;
};

const ZERO_BUCKETS = { notDue: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0, total: 0 };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function bucketFor(dueDate: string, today: Date): Bucket {
  const due = new Date(dueDate);
  const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (days < 0) return "notDue";
  if (days <= 30) return "b0_30";
  if (days <= 60) return "b31_60";
  if (days <= 90) return "b61_90";
  return "b90plus";
}

function daysOverdue(dueDate: string): number {
  const days = Math.floor((new Date().getTime() - new Date(dueDate).getTime()) / 86400000);
  return Math.max(0, days);
}

export default function AgeingReportPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithAllocations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<AgeingRow | null>(null);
  const [sortKey, setSortKey] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const [customerRes, invoiceRes] = await Promise.all([
        supabase.from("customers").select("*").order("name", { ascending: true }),
        supabase
          .from("invoices")
          .select("*, receipt_allocations(amount)")
          .in("status", ["open", "partial", "overdue"]),
      ]);

      if (customerRes.error) {
        setError(customerRes.error.message);
      } else {
        setCustomers(customerRes.data as Customer[]);
      }

      if (invoiceRes.error) {
        setError(invoiceRes.error.message);
      } else {
        setInvoices(invoiceRes.data as InvoiceWithAllocations[]);
      }

      setLoading(false);
    }

    load();
  }, []);

  const rows = useMemo<AgeingRow[]>(() => {
    const today = new Date();
    const byCustomer = new Map<string, AgeingRow>();
    for (const c of customers) {
      byCustomer.set(c.id, { id: c.id, name: c.name, ...ZERO_BUCKETS });
    }

    for (const inv of invoices) {
      const row = byCustomer.get(inv.customer_id);
      if (!row) continue;
      const outstanding = outstandingOf(inv);
      if (outstanding <= 0) continue;
      const bucket = bucketFor(inv.due_date, today);
      row[bucket] += outstanding;
      row.total += outstanding;
    }

    return Array.from(byCustomer.values()).filter((r) => r.total > 0);
  }, [customers, invoices]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      const av = Number(a[sortKey as Bucket | "total"] ?? 0);
      const bv = Number(b[sortKey as Bucket | "total"] ?? 0);
      return av - bv;
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const grandTotal = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          notDue: acc.notDue + r.notDue,
          b0_30: acc.b0_30 + r.b0_30,
          b31_60: acc.b31_60 + r.b31_60,
          b61_90: acc.b61_90 + r.b61_90,
          b90plus: acc.b90plus + r.b90plus,
          total: acc.total + r.total,
        }),
        { ...ZERO_BUCKETS }
      ),
    [rows]
  );

  const customerInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return invoices
      .filter((inv) => inv.customer_id === selectedCustomer.id && outstandingOf(inv) > 0)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [invoices, selectedCustomer]);

  const detailColumns: Column<InvoiceWithAllocations>[] = [
    { key: "invoice_no", header: "Invoice #" },
    {
      key: "invoice_date",
      header: "Invoice Date",
      render: (r) => new Date(r.invoice_date).toLocaleDateString("en-IN"),
    },
    { key: "customer_name", header: "Customer Name", render: () => selectedCustomer?.name ?? "" },
    { key: "due_date", header: "Due Date", render: (r) => new Date(r.due_date).toLocaleDateString("en-IN") },
    {
      key: "total",
      header: "Total Bill Amount",
      className: "text-right",
      render: (r) => money.format(Number(r.total)),
    },
    {
      key: "outstanding",
      header: "Due Bill Amount",
      className: "text-right",
      render: (r) => money.format(outstandingOf(r)),
    },
    {
      key: "overdueDays",
      header: "Overdue Days",
      className: "text-right",
      render: (r) => String(daysOverdue(r.due_date)),
    },
  ];

  const columns: Column<AgeingRow>[] = [
    {
      key: "name",
      header: "Customer",
      sortable: true,
      render: (r) => (
        <button
          type="button"
          onClick={() => setSelectedCustomer(r)}
          className="text-left font-medium text-brand hover:underline"
        >
          {r.name}
        </button>
      ),
    },
    {
      key: "notDue",
      header: "Not Due",
      sortable: true,
      className: "text-right",
      render: (r) => (
        <button type="button" onClick={() => setSelectedCustomer(r)} className="hover:underline">
          {money.format(r.notDue)}
        </button>
      ),
    },
    {
      key: "b0_30",
      header: "0–30 Days",
      sortable: true,
      className: "text-right",
      render: (r) => (
        <button type="button" onClick={() => setSelectedCustomer(r)} className="hover:underline">
          {money.format(r.b0_30)}
        </button>
      ),
    },
    {
      key: "b31_60",
      header: "31–60 Days",
      sortable: true,
      className: "text-right",
      render: (r) => (
        <button type="button" onClick={() => setSelectedCustomer(r)} className="hover:underline">
          {money.format(r.b31_60)}
        </button>
      ),
    },
    {
      key: "b61_90",
      header: "61–90 Days",
      sortable: true,
      className: "text-right",
      render: (r) => (
        <button type="button" onClick={() => setSelectedCustomer(r)} className="hover:opacity-80">
          {r.b61_90 > 0 ? (
            <span className="rounded px-2 py-0.5 font-medium bg-red-100 text-red-600">
              {money.format(r.b61_90)}
            </span>
          ) : (
            money.format(r.b61_90)
          )}
        </button>
      ),
    },
    {
      key: "b90plus",
      header: "90+ Days",
      sortable: true,
      className: "text-right",
      render: (r) => (
        <button type="button" onClick={() => setSelectedCustomer(r)} className="hover:opacity-80">
          {r.b90plus > 0 ? (
            <span className="rounded px-2 py-0.5 font-semibold bg-red-200 text-red-800">
              {money.format(r.b90plus)}
            </span>
          ) : (
            money.format(r.b90plus)
          )}
        </button>
      ),
    },
    {
      key: "total",
      header: "Total",
      className: "text-right font-semibold",
      render: (r) => (
        <button type="button" onClick={() => setSelectedCustomer(r)} className="hover:underline">
          {money.format(r.total)}
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="AR Ageing"
        subtitle="Outstanding receivables by customer, split into age buckets. Click a customer or amount for invoice detail."
        action={
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 print:hidden"
          >
            Print
          </button>
        }
      />

      <PrintHeader title="AR Ageing Report" />

      {!isConfigured && <NotConfigured />}

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <div className="print:overflow-visible">
          <DataTable
            columns={columns}
            rows={sortedRows}
            empty="No outstanding invoices."
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            rowClassName={(r) => (r.b90plus > 0 ? "bg-rose-50/50" : "")}
            footerRow={
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{money.format(grandTotal.notDue)}</td>
                <td className="px-4 py-3 text-right">{money.format(grandTotal.b0_30)}</td>
                <td className="px-4 py-3 text-right">{money.format(grandTotal.b31_60)}</td>
                <td className="px-4 py-3 text-right">{money.format(grandTotal.b61_90)}</td>
                <td className="px-4 py-3 text-right">{money.format(grandTotal.b90plus)}</td>
                <td className="px-4 py-3 text-right">{money.format(grandTotal.total)}</td>
              </tr>
            }
          />
        </div>
      )}

      {selectedCustomer && (
        <Modal title={`${selectedCustomer.name} — Outstanding Invoices`} onClose={() => setSelectedCustomer(null)}>
          <DataTable
            columns={detailColumns}
            rows={customerInvoices}
            empty="No outstanding invoices for this customer."
          />
        </Modal>
      )}
    </div>
  );
}
