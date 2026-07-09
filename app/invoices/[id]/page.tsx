"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { NotConfigured } from "@/components/NotConfigured";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/Skeleton";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import type { Customer, Invoice, InvoiceItem } from "@/lib/types";

/*
  Sales Invoice — View: read-only detail of one invoice.
  Route: /invoices/<invoice id>. The Invoice List screen links here.
*/

type AllocationRow = {
  id: string;
  amount: number;
  receipts: {
    receipt_no: string;
    receipt_date: string;
    mode: string;
  } | null;
};

export default function InvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  useEffect(() => {
    if (!supabase || !id) {
      setLoading(false);
      return;
    }
    const client = supabase;

    async function load() {
      const { data: inv } = await client
        .from("invoices")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!inv) {
        setLoading(false);
        return;
      }
      setInvoice(inv as Invoice);

      const [{ data: cust }, { data: lines }, { data: allocs }] = await Promise.all([
        client.from("customers").select("*").eq("id", inv.customer_id).maybeSingle(),
        client.from("invoice_items").select("*").eq("invoice_id", id),
        client
          .from("receipt_allocations")
          .select("id, amount, receipts(receipt_no, receipt_date, mode)")
          .eq("invoice_id", id),
      ]);

      setCustomer((cust as Customer) ?? null);
      setItems((lines as InvoiceItem[]) ?? []);
      setAllocations((allocs as unknown as AllocationRow[]) ?? []);
      setLoading(false);
    }

    load();
  }, [id]);

  if (!isConfigured) return <NotConfigured />;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <p className="font-semibold text-slate-700">Invoice not found.</p>
        <p className="mt-1 text-sm text-slate-500">
          It may have been deleted, or the link is wrong.
        </p>
        <Link href="/invoices" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
          ← Back to Sales Invoices
        </Link>
      </div>
    );
  }

  const received = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const outstanding = Number(invoice.total) - received;

  const itemColumns: Column<InvoiceItem>[] = [
    { key: "description", header: "Description" },
    { key: "qty", header: "Qty", className: "text-right w-20" },
    {
      key: "rate",
      header: "Rate",
      className: "text-right w-32",
      render: (r) => money.format(Number(r.rate)),
    },
    {
      key: "amount",
      header: "Amount",
      className: "text-right w-36",
      render: (r) => money.format(Number(r.amount)),
    },
  ];

  const paymentColumns: Column<AllocationRow>[] = [
    { key: "receipt_no", header: "Receipt No", render: (r) => r.receipts?.receipt_no ?? "—" },
    {
      key: "receipt_date",
      header: "Date",
      render: (r) => (r.receipts ? formatDate(r.receipts.receipt_date) : "—"),
    },
    {
      key: "mode",
      header: "Mode",
      render: (r) => <span className="uppercase">{r.receipts?.mode ?? "—"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      className: "text-right w-36",
      render: (r) => money.format(Number(r.amount)),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.invoice_no}`}
        subtitle={`Dated ${formatDate(invoice.invoice_date)} · Due ${formatDate(invoice.due_date)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/invoices/print/${invoice.id}`} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Print Preview
            </Link>
            <Link href="/invoices" className="text-sm font-medium text-brand hover:underline">
              ← All invoices
            </Link>
          </div>
        }
      />

      {/* Status + key amounts */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
          <div className="mt-2">
            <StatusBadge status={invoice.status} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice Total</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{money.format(Number(invoice.total))}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Received</p>
          <p className="mt-1 text-lg font-bold text-green-700">{money.format(received)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className={`mt-1 text-lg font-bold ${outstanding > 0 ? "text-red-600" : "text-green-700"}`}>
            {money.format(outstanding)}
          </p>
        </div>
      </div>

      {/* Customer block */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Billed To</p>
        {customer ? (
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900">
                {customer.name} <span className="ml-1 text-sm font-normal text-slate-400">({customer.code})</span>
              </p>
              {customer.address && <p className="mt-1 text-sm text-slate-500">{customer.address}</p>}
              {customer.gstin && <p className="mt-1 text-sm text-slate-500">GSTIN: {customer.gstin}</p>}
            </div>
            <div className="text-sm text-slate-500">
              {customer.contact_person && <p>{customer.contact_person}</p>}
              {customer.email && <p>{customer.email}</p>}
              {customer.phone && <p>{customer.phone}</p>}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Customer record not found.</p>
        )}
      </div>

      {/* Line items */}
      <h3 className="mb-2 text-sm font-semibold text-slate-600">Line Items</h3>
      <DataTable columns={itemColumns} rows={items} empty="No line items on this invoice." />

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-72 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex justify-between py-1 text-slate-600">
            <span>Subtotal</span>
            <span>{money.format(Number(invoice.subtotal))}</span>
          </div>
          <div className="flex justify-between py-1 text-slate-600">
            <span>Tax</span>
            <span>{money.format(Number(invoice.tax_amount))}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
            <span>Total</span>
            <span>{money.format(Number(invoice.total))}</span>
          </div>
          <div className="flex justify-between py-1 text-green-700">
            <span>Received</span>
            <span>− {money.format(received)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-red-600">
            <span>Outstanding</span>
            <span>{money.format(outstanding)}</span>
          </div>
        </div>
      </div>

      {/* Payments received */}
      <h3 className="mb-2 mt-8 text-sm font-semibold text-slate-600">Payments Against This Invoice</h3>
      <DataTable columns={paymentColumns} rows={allocations} empty="No payments received yet." />

      {invoice.notes && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
          <p className="mt-2 text-sm text-slate-700">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
