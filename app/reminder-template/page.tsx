"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { useToast } from "@/components/Toast";
import { isConfigured, supabase } from "@/lib/supabase";

type TemplateRecord = {
  id?: string | null;
  subject?: string | null;
  body?: string | null;
};

const PLACEHOLDERS = [
  "{customer}",
  "{amount}",
  "{days_overdue}",
  "{invoice_no}",
  "{invoice_date}",
  "{due_date}",
  "{company_name}",
];

const SAMPLE_VALUES: Record<string, string> = {
  customer: "ABC Industries",
  amount: "₹25,400",
  days_overdue: "18",
  invoice_no: "INV-10025",
  invoice_date: "05 Jul 2026",
  due_date: "20 Jul 2026",
  company_name: "Verve Advisory",
};

function renderTemplate(text: string) {
  return text.replace(/\{([^{}]+)\}/g, (match, key) => SAMPLE_VALUES[key] ?? match);
}

export default function ReminderTemplatePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [initialSubject, setInitialSubject] = useState("");
  const [initialBody, setInitialBody] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});
  const toast = useToast();

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!supabase || !isConfigured) {
      setLoading(false);
      return;
    }

    async function loadTemplate() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const client = supabase;
      const tryTable = async (table: string) => {
        return client.from(table).select("id, subject, body").order("id", { ascending: true }).limit(1).maybeSingle();
      };

      const firstAttempt = await tryTable("templates");
      let result = firstAttempt;

      if (firstAttempt.error) {
        result = await tryTable("reminder_templates");
      }

      if (!result.error && result.data) {
        const data = result.data as TemplateRecord;
        setTemplateId(data.id ?? null);
        setSubject(data.subject ?? "");
        setBody(data.body ?? "");
        setInitialSubject(data.subject ?? "");
        setInitialBody(data.body ?? "");
      } else {
        setTemplateId(null);
        setSubject("");
        setBody("");
        setInitialSubject("");
        setInitialBody("");
      }

      setLoading(false);
    }

    loadTemplate();
  }, []);

  const previewSubject = useMemo(() => renderTemplate(subject || "Reminder: your invoice is overdue"), [subject]);
  const previewBody = useMemo(() => renderTemplate(body || "Hello {customer},\n\nYour invoice {invoice_no} for {amount} is now {days_overdue} days overdue. Please review and settle it at your earliest convenience.\n\nRegards,\n{company_name}"), [body]);

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
      const input = subjectRef.current;
      if (!input) return;
      const start = subject.length;
      const nextValue = `${subject}${placeholder}`;
      setSubject(nextValue);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    }
  }

  function validate() {
    const nextErrors: { subject?: string; body?: string } = {};
    if (!subject.trim()) nextErrors.subject = "Subject is required.";
    if (!body.trim()) nextErrors.body = "Body is required.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    if (!supabase || !isConfigured || !validate()) {
      toast.error("Please fill in both the subject and body.");
      return;
    }

    const client = supabase;
    setSaving(true);

    const payload = {
      subject: subject.trim(),
      body: body.trim(),
    };

    const saveToTable = async (table: string) => {
      if (templateId) {
        return client.from(table).update(payload).eq("id", templateId).select("id").single();
      }
      return client.from(table).insert(payload).select("id").single();
    };

    let result = await saveToTable("templates");
    if (result.error) {
      result = await saveToTable("reminder_templates");
    }

    if (result.error) {
      toast.error("We could not save the template. Please try again.");
    } else {
      setTemplateId(result.data?.id ?? templateId);
      setInitialSubject(subject.trim());
      setInitialBody(body.trim());
      toast.success("Reminder template saved successfully.");
    }

    setSaving(false);
  }

  function handleReset() {
    setSubject(initialSubject);
    setBody(initialBody);
    setErrors({});
  }

  return (
    <>
      <PageHeader
        title="Reminder Template"
        subtitle="Configure the reminder email sent during AR follow-ups."
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Email template</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Create a professional reminder message for overdue invoices.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
                    {saving ? "Saving..." : "Save Template"}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  Loading your current template...
                </div>
              ) : (
                <div className="space-y-5">
                  <FormField label="Email Subject">
                    <input
                      ref={subjectRef}
                      className={inputClass}
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
                      className={`${inputClass} min-h-[360px] resize-y`}
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
              )}
            </form>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Available Placeholders</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Click any chip to insert it at the cursor position.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PLACEHOLDERS.map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      onClick={() => insertPlaceholder(placeholder)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 transition hover:border-brand hover:bg-brand/10 hover:text-brand"
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Quick Preview</h3>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Subject</p>
                  <p className="mt-1 text-sm text-slate-700">{previewSubject}</p>
                  <p className="mt-4 text-sm font-semibold text-slate-900">Body</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{previewBody}</p>
                </div>
              </div>
            </div>
          </div>

          {showPreview && (
            <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Email Preview</h3>
                    <p className="text-sm text-slate-500">Rendered with sample customer and invoice values.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">Subject</p>
                  <p className="mt-1 text-sm text-slate-700">{previewSubject}</p>
                  <p className="mt-4 text-sm font-semibold text-slate-900">Body</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{previewBody}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
