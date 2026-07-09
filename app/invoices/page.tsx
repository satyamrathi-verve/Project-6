"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { NotConfigured } from "@/components/NotConfigured";
import { StatusBadge } from "@/components/StatusBadge";
import { inputClass } from "@/components/FormField";
import { CsvImport } from "@/components/CsvImport";
import { TableSkeleton } from "@/components/Skeleton";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import type { CsvRow } from "@/lib/csv";
import {
  INVOICE_CSV_TEMPLATE_HEADERS,
  INVOICE_CSV_TEMPLATE_SAMPLE_ROWS,
  groupInvoiceRows,
  importInvoices,
} from "@/lib/csvImportInvoices";
import type { Customer, Invoice, InvoiceStatus } from "@/lib/types";

/*
  Sales Invoice — List. Links to /invoices/<id> (view) and /invoices/new (punch/edit).
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

export default function InvoiceListPage() {
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
            <Link
              href="/invoices/new"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + New Invoice
            </Link>
          </div>
        }
      />

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
