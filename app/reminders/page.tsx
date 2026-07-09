'use client';

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { FormField, inputClass } from "@/components/FormField";
import { DataTable, type Column } from "@/components/DataTable";
import { TableSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import { outstandingOf, type InvoiceWithAllocations } from "@/lib/receivables";
import type { ReminderLog, ReminderTemplate } from "@/lib/types";

type AgingBucket = "Not due" | "0-30 days" | "31-60 days" | "61-90 days" | "90+ days";

type OverdueRow = InvoiceWithAllocations & {
  customers?: { name: string } | null;
  balance_due: number;
  aging_bucket: AgingBucket;
};

type LogEntry = ReminderLog & {
  invoices?: { invoice_no: string; customer_id: string; customers?: { name: string } | null } | null;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderTemplate(template: string, data: Record<string, string>) {
  return template.replace(/\{([^{}]+)\}/g, (_, key) => data[key] ?? `{${key}}`);
}

function agingBucket(dueDate: string): AgingBucket {
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  if (days < 0) return "Not due";
  if (days <= 30) return "0-30 days";
  if (days <= 60) return "31-60 days";
  if (days <= 90) return "61-90 days";
  return "90+ days";
}

const agingClass: Record<AgingBucket, string> = {
  "Not due": "bg-slate-100 text-slate-600",
  "0-30 days": "bg-slate-100 text-slate-600",
  "31-60 days": "bg-slate-100 text-slate-600",
  "61-90 days": "bg-red-100 text-red-600",
  "90+ days": "bg-red-200 text-red-800",
};

export default function AutoEmailShootPage() {
  const toast = useToast();
  const [template, setTemplate] = useState<ReminderTemplate | null>(null);
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueRow[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState("");
  const [invoiceNoFilter, setInvoiceNoFilter] = useState("");

  useEffect(() => {
    async function loadData() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const [templateRes, overdueRes, logRes] = await Promise.all([
        supabase.from("reminder_templates").select("*").order("id", { ascending: true }).limit(1).maybeSingle(),
        supabase
          .from("invoices")
          .select("*, customers(name), receipt_allocations(amount)")
          .eq("status", "overdue")
          .order("due_date", { ascending: true }),
        supabase
          .from("reminder_log")
          .select("*, invoices(invoice_no, customer_id, customers(name))")
          .order("sent_at", { ascending: false })
          .limit(200),
      ]);

      if (!templateRes.error && templateRes.data) {
        setTemplate(templateRes.data as ReminderTemplate);
      }

      if (!overdueRes.error && overdueRes.data) {
        const invoices = overdueRes.data as (InvoiceWithAllocations & { customers?: { name: string } | null })[];
        const rows: OverdueRow[] = invoices.map((invoice) => ({
          ...invoice,
          balance_due: outstandingOf(invoice),
          aging_bucket: agingBucket(invoice.due_date),
        }));
        setOverdueInvoices(rows);
      }

      if (!logRes.error && logRes.data) {
        setLog(logRes.data as LogEntry[]);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    overdueInvoices.forEach((invoice) => {
      if (invoice.customers?.name) names.add(invoice.customers.name);
    });
    return Array.from(names).sort();
  }, [overdueInvoices]);

  const invoiceNoOptions = useMemo(
    () => overdueInvoices.map((invoice) => invoice.invoice_no).sort(),
    [overdueInvoices]
  );

  const filteredInvoices = useMemo(() => {
    return overdueInvoices.filter((invoice) => {
      const matchesCustomer = !customerFilter || invoice.customers?.name === customerFilter;
      const matchesInvoiceNo = !invoiceNoFilter || invoice.invoice_no === invoiceNoFilter;
      return matchesCustomer && matchesInvoiceNo;
    });
  }, [overdueInvoices, customerFilter, invoiceNoFilter]);

  const totals = useMemo(
    () => ({
      count: filteredInvoices.length,
      outstanding: filteredInvoices.reduce((sum, invoice) => sum + invoice.balance_due, 0),
    }),
    [filteredInvoices]
  );

  const remindersByInvoiceId = useMemo(() => {
    return log.reduce((acc: Record<string, LogEntry[]>, entry) => {
      if (!entry.invoice_id) return acc;
      (acc[entry.invoice_id] ||= []).push(entry);
      return acc;
    }, {});
  }, [log]);

  // Selecting an invoice shows its full audit trail; selecting a customer shows
  // their consolidated touchpoint history across invoices; otherwise, the recent log.
  const historyTitle = invoiceNoFilter
    ? `Audit trail — ${invoiceNoFilter}`
    : customerFilter
    ? `Touchpoint history — ${customerFilter}`
    : "Recent reminder log";

  const historyEntries = useMemo(() => {
    if (invoiceNoFilter) {
      return log.filter((entry) => entry.invoices?.invoice_no === invoiceNoFilter);
    }
    if (customerFilter) {
      return log.filter((entry) => entry.invoices?.customers?.name === customerFilter);
    }
    return log.slice(0, 20);
  }, [log, invoiceNoFilter, customerFilter]);

  async function sendReminders() {
    if (!supabase || !template) return;
    setSending(true);
    setMessage(null);

    const logRows = filteredInvoices.map((invoice) => {
      const customerName = invoice.customers?.name ?? "Customer";
      const daysOverdue = invoice.due_date ? String(Math.max(0, Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000))) : "0";
      const data = {
        customer: customerName,
        amount: money.format(invoice.balance_due),
        days_overdue: daysOverdue,
        invoice_no: invoice.invoice_no,
      };

      return {
        invoice_id: invoice.id,
        to_email: null,
        subject: renderTemplate(template.subject || "", data),
        body: renderTemplate(template.body || "", data),
        status: "sent",
        sent_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from("reminder_log").insert(logRows);
    if (error) {
      setMessage("Unable to log the reminders right now.");
      toast.error("Unable to log the reminders right now.");
    } else {
      setMessage("Reminder emails logged successfully.");
      toast.success(`Logged reminders for ${logRows.length} overdue invoice${logRows.length === 1 ? "" : "s"}.`);
      const { data: freshLog } = await supabase
        .from("reminder_log")
        .select("*, invoices(invoice_no, customer_id, customers(name))")
        .order("sent_at", { ascending: false })
        .limit(200);
      setLog((freshLog as LogEntry[]) || []);
    }

    setSending(false);
  }

  const columns: Column<OverdueRow>[] = [
    { key: "invoice_no", header: "Invoice #" },
    {
      key: "customer",
      header: "Customer account",
      render: (row) => row.customers?.name ?? row.customer_id,
    },
    { key: "due_date", header: "Due date", render: (row) => formatDate(row.due_date) },
    {
      key: "aging_bucket",
      header: "Aging bucket",
      render: (row) => (
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${agingClass[row.aging_bucket]}`}>
          {row.aging_bucket}
        </span>
      ),
    },
    {
      key: "balance_due",
      header: "Overdue amount",
      render: (row) => money.format(row.balance_due),
    },
    {
      key: "reminders_sent",
      header: "Reminders sent",
      render: (row) => {
        const entries = remindersByInvoiceId[row.id] || [];
        if (entries.length === 0) return <span className="text-slate-400">None yet</span>;
        return (
          <span>
            {entries.length} · last {formatDate(entries[0].sent_at)}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="AR Followup"
        subtitle="Filter overdue invoices by customer or invoice number, review follow-up history, and send reminders."
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Customer name">
                <select
                  value={customerFilter}
                  onChange={(event) => setCustomerFilter(event.target.value)}
                  className={inputClass}
                >
                  <option value="">All customers</option>
                  {customerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Invoice #">
                <select
                  value={invoiceNoFilter}
                  onChange={(event) => setInvoiceNoFilter(event.target.value)}
                  className={inputClass}
                >
                  <option value="">All invoices</option>
                  {invoiceNoOptions.map((invoiceNo) => (
                    <option key={invoiceNo} value={invoiceNo}>
                      {invoiceNo}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Overdue invoices</h3>
                  <p className="text-sm text-slate-500">
                    Review overdue invoices and send reminders for each one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={sendReminders}
                  disabled={sending || loading || !template || filteredInvoices.length === 0}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending..." : "Send reminders"}
                </button>
              </div>

              {message && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  {message}
                </div>
              )}

              {loading ? (
                <TableSkeleton rows={5} />
              ) : (
                <DataTable
                  columns={columns}
                  rows={filteredInvoices}
                  empty={
                    overdueInvoices.length === 0
                      ? "No overdue invoices found."
                      : "No overdue invoices match your filters."
                  }
                />
              )}
            </section>

            <aside className="space-y-6">
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Reminder template</h3>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Use the Reminder Template screen to edit the subject and body before sending.
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Summary</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>Invoices overdue</span>
                    <span className="font-semibold">{totals.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total outstanding</span>
                    <span className="font-semibold">{money.format(totals.outstanding)}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">{historyTitle}</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  {historyEntries.length === 0 ? (
                    <p className="text-slate-500">No reminders have been logged yet.</p>
                  ) : (
                    historyEntries.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {entry.invoices?.invoice_no ?? entry.invoice_id} · {entry.invoices?.customers?.name ?? "Customer"}
                        </p>
                        <p className="text-xs text-slate-500">{formatDateTime(entry.sent_at)}</p>
                        <p className="mt-2 text-sm text-slate-700 line-clamp-2">{entry.subject}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
