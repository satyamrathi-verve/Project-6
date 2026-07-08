'use client';

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { isConfigured, supabase } from "@/lib/supabase";
import type { Invoice, ReminderLog, ReminderTemplate } from "@/lib/types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function renderTemplate(template: string, data: Record<string, string>) {
  return template.replace(/\{([^{}]+)\}/g, (_, key) => data[key] ?? `{${key}}`);
}

export default function AutoEmailShootPage() {
  const [template, setTemplate] = useState<ReminderTemplate | null>(null);
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([]);
  const [log, setLog] = useState<ReminderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
          .select("*, customers(name)")
          .eq("status", "overdue")
          .order("due_date", { ascending: true }),
        supabase.from("reminder_log").select("*").order("sent_at", { ascending: false }).limit(20),
      ]);

      if (!templateRes.error && templateRes.data) {
        setTemplate(templateRes.data as ReminderTemplate);
      }

      if (!overdueRes.error && overdueRes.data) {
        setOverdueInvoices(overdueRes.data as Invoice[]);
      }

      if (!logRes.error && logRes.data) {
        setLog(logRes.data as ReminderLog[]);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const totals = useMemo(
    () => ({
      count: overdueInvoices.length,
      outstanding: overdueInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
    }),
    [overdueInvoices]
  );

  async function sendReminders() {
    if (!supabase || !template) return;
    setSending(true);
    setMessage(null);

    const logRows = overdueInvoices.map((invoice) => {
      const customerName = (invoice as any).customers?.name ?? "Customer";
      const daysOverdue = invoice.due_date ? String(Math.max(0, Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000))) : "0";
      const data = {
        customer: customerName,
        amount: formatCurrency(invoice.total),
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
    } else {
      setMessage("Reminder emails logged successfully.");
      const { data: freshLog } = await supabase.from("reminder_log").select("*").order("sent_at", { ascending: false }).limit(20);
      setLog((freshLog as ReminderLog[]) || []);
    }

    setSending(false);
  }

  return (
    <>
      <PageHeader
        title="Auto Email Shoot"
        subtitle="Generate overdue-reminder emails and log them in the system."
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
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
                disabled={sending || loading || !template || overdueInvoices.length === 0}
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading overdue invoices...</div>
            ) : overdueInvoices.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No overdue invoices found.
              </div>
            ) : (
              <div className="space-y-4">
                {overdueInvoices.map((invoice) => {
                  const customerName = (invoice as any).customers?.name ?? invoice.customer_id;
                  return (
                    <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{invoice.invoice_no}</p>
                          <p className="text-sm text-slate-500">{customerName}</p>
                        </div>
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
                          {invoice.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span>{formatDate(invoice.due_date)}</span>
                        <span className="inline-flex h-1 w-1 rounded-full bg-slate-400" />
                        <span>{formatCurrency(invoice.total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                  <span className="font-semibold">{formatCurrency(totals.outstanding)}</span>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-slate-900">Recent reminder log</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                {log.length === 0 ? (
                  <p className="text-slate-500">No reminders have been logged yet.</p>
                ) : (
                  log.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">Invoice {entry.invoice_id}</p>
                      <p className="text-xs text-slate-500">{new Date(entry.sent_at).toLocaleString()}</p>
                      <p className="mt-2 text-sm text-slate-700 line-clamp-2">{entry.subject}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
