'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import { effectiveStatus, outstandingOf } from "@/lib/receivables";
import type { Company, Customer, Invoice, InvoiceItem } from "@/lib/types";

type AllocationRow = {
  amount: number;
  receipts: {
    receipt_no: string;
    receipt_date: string;
    mode: string;
  } | null;
};

export default function InvoicePrintPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  useEffect(() => {
    if (!supabase || !id) {
      setLoading(false);
      return;
    }

    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const client = supabase;
      const { data: invoiceData } = await client
        .from("invoices")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!invoiceData) {
        setInvoice(null);
        setLoading(false);
        return;
      }

      const invoiceRecord = invoiceData as Invoice;
      setInvoice(invoiceRecord);

      const [{ data: companyData }, { data: customerData }, { data: lineItems }, { data: allocationData }] = await Promise.all([
        client.from("company").select("*").maybeSingle(),
        client.from("customers").select("*").eq("id", invoiceRecord.customer_id).maybeSingle(),
        client.from("invoice_items").select("*").eq("invoice_id", id).order("id", { ascending: true }),
        client
          .from("receipt_allocations")
          .select("amount, receipts(receipt_no, receipt_date, mode)")
          .eq("invoice_id", id),
      ]);

      const normalizedAllocations = ((allocationData as Array<{ amount: number; receipts: { receipt_no: string; receipt_date: string; mode: string } | null }> | null) ?? []).map((row) => ({
        amount: Number(row.amount),
        receipts: row.receipts ?? null,
      }));

      setCompany((companyData as Company | null) ?? null);
      setCustomer((customerData as Customer | null) ?? null);
      setItems((lineItems as InvoiceItem[]) ?? []);
      setAllocations(normalizedAllocations as AllocationRow[]);
      setLoading(false);
    }

    void load();
  }, [id]);

  const received = useMemo(() => allocations.reduce((sum, row) => sum + Number(row.amount), 0), [allocations]);
  const outstanding = invoice ? outstandingOf({ ...invoice, receipt_allocations: allocations }) : 0;
  const liveStatus = invoice ? effectiveStatus(invoice, outstanding) : null;

  if (!isConfigured) return <NotConfigured />;

  if (loading) {
    return <p className="py-10 text-center text-slate-400">Loading invoice preview…</p>;
  }

  if (!invoice) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <p className="font-semibold text-slate-700">Invoice not found.</p>
        <p className="mt-1 text-sm text-slate-500">The invoice may have been removed or the link is wrong.</p>
        <Link href="/invoices" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
          ← Back to Sales Invoices
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Sales Invoice — Print Preview"
          subtitle="A clean, printable invoice layout using the existing invoice data."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Print
              </button>
              <Link href={`/invoices/${id}`} className="text-sm font-medium text-brand hover:underline">
                ← Back to invoice
              </Link>
            </div>
          }
        />
      </div>

      <div className="print-shell rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 md:p-8">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
          <div className="flex flex-col gap-6 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Tax Invoice</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{company?.name ?? "Verve Advisory"}</h2>
              {company?.address && <p className="mt-1 text-sm text-slate-600">{company.address}</p>}
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                {company?.email && <p>{company.email}</p>}
                {company?.phone && <p>{company.phone}</p>}
                {company?.gstin && <p>GSTIN: {company.gstin}</p>}
              </div>
            </div>

            <div className="min-w-[240px] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-4 py-1">
                <span className="text-slate-500">Invoice No.</span>
                <span className="font-semibold text-slate-900">{invoice.invoice_no}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-1">
                <span className="text-slate-500">Invoice Date</span>
                <span>{formatDate(invoice.invoice_date)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-1">
                <span className="text-slate-500">Due Date</span>
                <span>{formatDate(invoice.due_date)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-1">
                <span className="text-slate-500">Status</span>
                <span className="font-semibold uppercase text-slate-900">{liveStatus}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Bill To</p>
              {customer ? (
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{customer.name}</p>
                  {customer.address && <p>{customer.address}</p>}
                  {customer.contact_person && <p>Contact: {customer.contact_person}</p>}
                  {customer.email && <p>{customer.email}</p>}
                  {customer.phone && <p>{customer.phone}</p>}
                  {customer.gstin && <p>GSTIN: {customer.gstin}</p>}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Customer details unavailable.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Amount Summary</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{money.format(Number(invoice.subtotal))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tax</span>
                  <span>{money.format(Number(invoice.tax_amount))}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{money.format(Number(invoice.total))}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-green-700">
                  <span>Received</span>
                  <span>− {money.format(received)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-semibold text-red-600">
                  <span>Amount Due</span>
                  <span>{money.format(outstanding)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold text-right">Qty</th>
                  <th className="px-4 py-3 font-semibold text-right">Rate</th>
                  <th className="px-4 py-3 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{item.description}</td>
                    <td className="px-4 py-3 text-right">{item.qty}</td>
                    <td className="px-4 py-3 text-right">{money.format(Number(item.rate))}</td>
                    <td className="px-4 py-3 text-right">{money.format(Number(item.amount))}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      No line items found for this invoice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {invoice.notes && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Notes</p>
              <p className="mt-2 text-sm text-slate-700">{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
            color: #111827 !important;
          }

          nav,
          aside,
          [role="navigation"],
          .no-print {
            display: none !important;
          }

          .print-shell {
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .print-shell .rounded-xl,
          .print-shell .rounded-2xl {
            box-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
}
