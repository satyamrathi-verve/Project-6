"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, formatDate } from "@/lib/format";
import { outstandingOf, type InvoiceWithAllocations } from "@/lib/receivables";
import type { ReminderTemplate, Company } from "@/lib/types";

type OverdueInvoice = InvoiceWithAllocations & {
  customers?: { name: string; email: string | null; contact_person: string | null } | null;
};

type PlaceholderGroup = {
  title: string;
  placeholders: string[];
};

// Every token here is actually filled in by AR Followup's send logic
// (app/reminders/page.tsx) — don't add one here without wiring it up there
// too, or it'll show up literally as "{token}" in a sent reminder.
const PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  {
    title: "Customer",
    placeholders: ["{customer}", "{contact_person}", "{customer_email}"],
  },
  {
    title: "Invoice",
    placeholders: ["{invoice_no}", "{invoice_date}", "{due_date}", "{invoice_total}", "{amount}"],
  },
  {
    title: "Reminder",
    placeholders: ["{days_overdue}", "{today_date}"],
  },
  {
    title: "Company",
    placeholders: ["{company_name}", "{company_email}", "{company_phone}"],
  },
];

const SAMPLE_VALUES: Record<string, string> = {
  customer: "ABC Industries",
  contact_person: "Asha Patel",
  customer_email: "accounts@abcindustries.com",
  invoice_no: "INV-10025",
  invoice_date: "05 Jul 2026",
  due_date: "20 Jul 2026",
  invoice_total: "₹25,400",
  amount: "₹25,400",
  days_overdue: "18",
  today_date: "09 Jul 2026",
  company_name: "Verve Advisory",
  company_email: "finance@verveadvisory.com",
  company_phone: "+91 99999 99999",
};

function renderTemplate(text: string, values: Record<string, string>) {
  return text.replace(/\{([^{}]+)\}/g, (match, key) => values[key] ?? match);
}

export default function ReminderTemplatePage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; subject?: string; body?: string }>({});

  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState("");

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  async function loadTemplates(selectId?: string | null) {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const result = await supabase.from("reminder_templates").select("*").order("name", { ascending: true });

    if (!result.error && result.data) {
      const list = result.data as ReminderTemplate[];
      setTemplates(list);
      const next = list.find((t) => t.id === selectId) ?? list[0] ?? null;
      selectTemplate(next);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!supabase || !isConfigured) {
      setLoading(false);
      return;
    }
    loadTemplates();

    async function loadPreviewData() {
      if (!supabase) return;
      const today = new Date().toISOString().slice(0, 10);
      const [invoiceRes, companyRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, customers(name, email, contact_person), receipt_allocations(amount)")
          .in("status", ["open", "partial", "overdue"])
          .lt("due_date", today)
          .order("due_date", { ascending: true }),
        supabase.from("company").select("*").limit(1).maybeSingle(),
      ]);

      if (!invoiceRes.error && invoiceRes.data) {
        setOverdueInvoices(invoiceRes.data as OverdueInvoice[]);
      }
      if (!companyRes.error && companyRes.data) {
        setCompany(companyRes.data as Company);
      }
    }
    loadPreviewData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTemplate(t: ReminderTemplate | null) {
    setSelectedId(t?.id ?? null);
    setName(t?.name ?? "");
    setSubject(t?.subject ?? "");
    setBody(t?.body ?? "");
    setErrors({});
  }

  function handleNewTemplate() {
    setSelectedId(null);
    setName("");
    setSubject("");
    setBody("");
    setErrors({});
  }

  const previewInvoice = useMemo(
    () => overdueInvoices.find((inv) => inv.id === previewInvoiceId) ?? null,
    [overdueInvoices, previewInvoiceId]
  );

  const previewValues = useMemo(() => {
    if (!previewInvoice) return SAMPLE_VALUES;
    const days = Math.max(0, Math.floor((Date.now() - new Date(previewInvoice.due_date).getTime()) / 86400000));
    return {
      customer: previewInvoice.customers?.name ?? "Customer",
      contact_person: previewInvoice.customers?.contact_person ?? "",
      customer_email: previewInvoice.customers?.email ?? "",
      amount: money.format(outstandingOf(previewInvoice)),
      invoice_total: money.format(Number(previewInvoice.total)),
      days_overdue: String(days),
      invoice_no: previewInvoice.invoice_no,
      invoice_date: formatDate(previewInvoice.invoice_date),
      due_date: formatDate(previewInvoice.due_date),
      today_date: formatDate(new Date().toISOString()),
      company_name: company?.name ?? SAMPLE_VALUES.company_name,
      company_email: company?.email ?? "",
      company_phone: company?.phone ?? "",
    };
  }, [previewInvoice, company]);

  const previewSubject = useMemo(
    () => renderTemplate(subject || "Reminder: your invoice is overdue", previewValues),
    [subject, previewValues]
  );
  const previewBody = useMemo(
    () =>
      renderTemplate(
        body ||
          "Hello {customer},\n\nThis is a friendly reminder that invoice {invoice_no} for {invoice_total} remains outstanding. The balance due is {amount} and the invoice was due on {due_date}. Please review and settle this amount at your earliest convenience.\n\nRegards,\n{company_name}",
        previewValues
      ),
    [body, previewValues]
  );

  function insertPlaceholder(placeholder: string) {
    const active = document.activeElement;
    const target = active === subjectRef.current ? "subject" : active === bodyRef.current ? "body" : null;

    if (target === "subject") {
      const input = subjectRef.current;
      if (!input) return;
      const start = input.selectionStart ?? subject.length;
      const end = input.selectionEnd ?? subject.length;
      const nextValue = `${subject.slice(0, start)}${placeholder}${subject.slice(end)}`;
      setSubject(nextValue);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    } else if (target === "body") {
      const input = bodyRef.current;
      if (!input) return;
      const start = input.selectionStart ?? body.length;
      const end = input.selectionEnd ?? body.length;
      const nextValue = `${body.slice(0, start)}${placeholder}${body.slice(end)}`;
      setBody(nextValue);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    } else {
      const input = bodyRef.current ?? subjectRef.current;
      if (!input) return;
      const start = body.length;
      const nextValue = `${body}${placeholder}`;
      setBody(nextValue);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    }
  }

  function validate() {
    const nextErrors: { name?: string; subject?: string; body?: string } = {};
    if (!name.trim()) nextErrors.name = "Name is required.";
    if (!subject.trim()) nextErrors.subject = "Subject is required.";
    if (!body.trim()) nextErrors.body = "Body is required.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();

    if (!supabase || !isConfigured || !validate()) {
      toast.error("Please fill in the name, subject, and body.");
      return;
    }

    const client = supabase;
    setSaving(true);

    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
    };

    const result = selectedId
      ? await client.from("reminder_templates").update(payload).eq("id", selectedId).select("id").single()
      : await client.from("reminder_templates").insert(payload).select("id").single();

    if (result.error) {
      toast.error("We could not save the template. Please try again.");
    } else {
      toast.success("Reminder template saved successfully.");
      await loadTemplates(result.data?.id ?? selectedId);
    }

    setSaving(false);
  }

  function handleReset() {
    const current = templates.find((t) => t.id === selectedId) ?? null;
    selectTemplate(current);
  }

  async function handleDelete() {
    if (!supabase || !selectedId) return;
    setDeleting(true);

    const { error } = await supabase.from("reminder_templates").delete().eq("id", selectedId);

    if (error) {
      toast.error("We could not delete the template. Please try again.");
    } else {
      toast.success("Template deleted.");
      setConfirmDelete(false);
      await loadTemplates(null);
    }

    setDeleting(false);
  }

  return (
    <>
      <PageHeader title="Reminder Template" subtitle="Configure the reminder emails sent during AR follow-ups." />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    t.id === selectedId
                      ? "bg-brand text-white"
                      : "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-brand hover:text-brand"
                  }`}
                >
                  {t.name}
                </button>
              ))}
              <button
                type="button"
                onClick={handleNewTemplate}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  selectedId === null && !loading
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-brand hover:text-brand"
                }`}
              >
                + New template
              </button>
            </div>
          </div>

          <div className="grid gap-6 2xl:grid-cols-[1.35fr_0.75fr]">
            <form onSubmit={handleSave} className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Email template</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Create a professional reminder message for overdue invoices.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedId && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="rounded-lg border border-brand/20 bg-brand/10 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand/20"
                  >
                    Preview
                  </button>
                  <button
                    type="submit"
                    disabled={saving || loading}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? "Saving..." : selectedId ? "Save Template" : "Create Template"}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-600 dark:text-slate-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  Loading your templates...
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      Template
                    </h4>
                    <div className="mt-4">
                      <FormField label="Template Name">
                        <input
                          className={`${inputClass} ${errors.name ? "border-rose-400" : ""}`}
                          value={name}
                          onChange={(event) => {
                            setName(event.target.value);
                            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                          }}
                          placeholder="e.g. First reminder, Final notice"
                        />
                        {errors.name && <p className="text-sm text-rose-600">{errors.name}</p>}
                      </FormField>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Email Content</h4>
                    <div className="mt-4 space-y-4">
                      <FormField label="Subject">
                        <input
                          ref={subjectRef}
                          className={`${inputClass} ${errors.subject ? "border-rose-400" : ""}`}
                          value={subject}
                          onChange={(event) => {
                            setSubject(event.target.value);
                            if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
                          }}
                          placeholder="Payment reminder: invoice {invoice_no}"
                        />
                        {errors.subject && <p className="text-sm text-rose-600">{errors.subject}</p>}
                      </FormField>

                      <FormField label="Email Body">
                        <textarea
                          ref={bodyRef}
                          className={`${inputClass} min-h-[360px] resize-y ${errors.body ? "border-rose-400" : ""}`}
                          value={body}
                          onChange={(event) => {
                            setBody(event.target.value);
                            if (errors.body) setErrors((prev) => ({ ...prev, body: undefined }));
                          }}
                          placeholder="Hello {customer},\n\nWe are following up on invoice {invoice_no} for {amount}..."
                        />
                        {errors.body && <p className="text-sm text-rose-600">{errors.body}</p>}
                      </FormField>
                    </div>
                  </div>
                </div>
              )}
            </form>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Placeholders</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Grouped by context — click to insert at the cursor.</p>
                <div className="mt-4 space-y-4">
                  {PLACEHOLDER_GROUPS.map((group) => (
                    <div key={group.title}>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{group.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.placeholders.map((placeholder) => (
                          <button
                            key={placeholder}
                            type="button"
                            onClick={() => insertPlaceholder(placeholder)}
                            className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-1 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:border-brand hover:bg-brand/10 hover:text-brand"
                          >
                            {placeholder}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Live Email Preview</h3>
                <div className="mt-3">
                  <FormField label="Preview with">
                    <select
                      value={previewInvoiceId}
                      onChange={(event) => setPreviewInvoiceId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Sample data</option>
                      {overdueInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_no} — {inv.customers?.name ?? "Customer"}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                  <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Subject</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{previewSubject}</p>
                  </div>
                  <div className="p-4 text-sm text-slate-700 dark:text-slate-300">
                    <p className="whitespace-pre-wrap">{previewBody}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {showPreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Email Preview</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {previewInvoice
                        ? `Rendered with real values from ${previewInvoice.invoice_no}.`
                        : "Rendered with sample customer and invoice values."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    Close
                  </button>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                  <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Subject</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{previewSubject}</p>
                  </div>
                  <div className="p-4 text-sm text-slate-700 dark:text-slate-300">
                    <p className="whitespace-pre-wrap">{previewBody}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {confirmDelete && (
            <Modal title="Delete this template?" onClose={() => setConfirmDelete(false)}>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Delete <span className="font-semibold">{name || "this template"}</span>? This can&apos;t be undone.
                Any invoice reminders already sent using it will keep their record in the touchpoint log.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : "Delete template"}
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}
    </>
  );
}
