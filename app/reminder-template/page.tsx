"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { isConfigured, supabase } from "@/lib/supabase";

type TemplateRecord = {
  id?: string | null;
  template_name?: string | null;
  reminder_level?: string | null;
  email_from?: string | null;
  reply_to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  status?: string | null;
  include_invoice_pdf?: boolean | null;
  include_customer_statement?: boolean | null;
  stop_after_payment?: boolean | null;
  auto_email?: boolean | null;
  subject?: string | null;
  body?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  version?: number | string | null;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type PlaceholderGroup = {
  title: string;
  placeholders: string[];
};

const PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  {
    title: "Customer",
    placeholders: ["{customer}", "{contact_person}", "{customer_email}"],
  },
  {
    title: "Invoice",
    placeholders: ["{invoice_no}", "{invoice_date}", "{due_date}", "{invoice_total}", "{outstanding_amount}", "{currency}"],
  },
  {
    title: "Reminder",
    placeholders: ["{days_overdue}", "{today_date}"],
  },
  {
    title: "Payment",
    placeholders: ["{payment_link}", "{bank_details}"],
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
  outstanding_amount: "₹25,400",
  currency: "INR",
  days_overdue: "18",
  today_date: "09 Jul 2026",
  payment_link: "https://example.com/pay",
  bank_details: "A/C 123456789 | HDFC Bank",
  company_name: "Verve Advisory",
  company_email: "finance@verveadvisory.com",
  company_phone: "+91 99999 99999",
};

function renderTemplate(text: string, values: Record<string, string>) {
  return text.replace(/\{([^{}]+)\}/g, (match, key) => values[key] ?? match);
}

export default function ReminderTemplatePage() {
  const [templateName, setTemplateName] = useState("");
  const [reminderLevel, setReminderLevel] = useState("Level 1 Reminder");
  const [emailFrom, setEmailFrom] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [status, setStatus] = useState("active");
  const [includeInvoicePdf, setIncludeInvoicePdf] = useState(false);
  const [includeCustomerStatement, setIncludeCustomerStatement] = useState(false);
  const [stopAfterPayment, setStopAfterPayment] = useState(false);
  const [autoEmail, setAutoEmail] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [createdBy, setCreatedBy] = useState("System");
  const [updatedBy, setUpdatedBy] = useState("System");
  const [version, setVersion] = useState("1.0");
  const [initialValues, setInitialValues] = useState({
    templateName: "",
    reminderLevel: "Level 1 Reminder",
    emailFrom: "",
    replyTo: "",
    cc: "",
    bcc: "",
    status: "active",
    includeInvoicePdf: false,
    includeCustomerStatement: false,
    stopAfterPayment: false,
    autoEmail: false,
    subject: "",
    body: "",
    createdBy: "System",
    updatedBy: "System",
    version: "1.0",
  });
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [errors, setErrors] = useState<{ templateName?: string; reminderLevel?: string; subject?: string; body?: string }>({});

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!supabase || !isConfigured) {
      setLoading(false);
      return;
    }

    async function loadTemplate() {
      const client = supabase;

      const loadFromTable = async (table: string) => {
        const broadResult = await client
          .from(table)
          .select(
            "id, subject, body, template_name, reminder_level, email_from, reply_to, cc, bcc, status, include_invoice_pdf, include_customer_statement, stop_after_payment, auto_email, created_by, updated_by, version"
          )
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!broadResult.error) {
          return broadResult;
        }

        return client
          .from(table)
          .select("id, subject, body")
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();
      };

      let result = await loadFromTable("templates");
      if (result.error) {
        result = await loadFromTable("reminder_templates");
      }

      if (!result.error && result.data) {
        const data = result.data as TemplateRecord;
        setTemplateId(data.id ?? null);
        setTemplateName(data.template_name ?? "");
        setReminderLevel(data.reminder_level ?? "Level 1 Reminder");
        setEmailFrom(data.email_from ?? "");
        setReplyTo(data.reply_to ?? "");
        setCc(data.cc ?? "");
        setBcc(data.bcc ?? "");
        setStatus(data.status ?? "active");
        setIncludeInvoicePdf(Boolean(data.include_invoice_pdf));
        setIncludeCustomerStatement(Boolean(data.include_customer_statement));
        setStopAfterPayment(Boolean(data.stop_after_payment));
        setAutoEmail(Boolean(data.auto_email));
        setSubject(data.subject ?? "");
        setBody(data.body ?? "");
        setCreatedBy(data.created_by ?? "System");
        setUpdatedBy(data.updated_by ?? "System");
        setVersion(data.version ? String(data.version) : "1.0");
        setInitialValues({
          templateName: data.template_name ?? "",
          reminderLevel: data.reminder_level ?? "Level 1 Reminder",
          emailFrom: data.email_from ?? "",
          replyTo: data.reply_to ?? "",
          cc: data.cc ?? "",
          bcc: data.bcc ?? "",
          status: data.status ?? "active",
          includeInvoicePdf: Boolean(data.include_invoice_pdf),
          includeCustomerStatement: Boolean(data.include_customer_statement),
          stopAfterPayment: Boolean(data.stop_after_payment),
          autoEmail: Boolean(data.auto_email),
          subject: data.subject ?? "",
          body: data.body ?? "",
          createdBy: data.created_by ?? "System",
          updatedBy: data.updated_by ?? "System",
          version: data.version ? String(data.version) : "1.0",
        });
      } else {
        setTemplateId(null);
        setTemplateName("");
        setReminderLevel("Level 1 Reminder");
        setEmailFrom("");
        setReplyTo("");
        setCc("");
        setBcc("");
        setStatus("active");
        setIncludeInvoicePdf(false);
        setIncludeCustomerStatement(false);
        setStopAfterPayment(false);
        setAutoEmail(false);
        setSubject("");
        setBody("");
        setCreatedBy("System");
        setUpdatedBy("System");
        setVersion("1.0");
        setInitialValues({
          templateName: "",
          reminderLevel: "Level 1 Reminder",
          emailFrom: "",
          replyTo: "",
          cc: "",
          bcc: "",
          status: "active",
          includeInvoicePdf: false,
          includeCustomerStatement: false,
          stopAfterPayment: false,
          autoEmail: false,
          subject: "",
          body: "",
          createdBy: "System",
          updatedBy: "System",
          version: "1.0",
        });
      }

      setLoading(false);
    }

    void loadTemplate();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const hasChanges = [
      templateName !== initialValues.templateName,
      reminderLevel !== initialValues.reminderLevel,
      emailFrom !== initialValues.emailFrom,
      replyTo !== initialValues.replyTo,
      cc !== initialValues.cc,
      bcc !== initialValues.bcc,
      status !== initialValues.status,
      includeInvoicePdf !== initialValues.includeInvoicePdf,
      includeCustomerStatement !== initialValues.includeCustomerStatement,
      stopAfterPayment !== initialValues.stopAfterPayment,
      autoEmail !== initialValues.autoEmail,
      subject !== initialValues.subject,
      body !== initialValues.body,
      createdBy !== initialValues.createdBy,
      updatedBy !== initialValues.updatedBy,
      version !== initialValues.version,
    ].some(Boolean);

    if (!hasChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [
    templateName,
    reminderLevel,
    emailFrom,
    replyTo,
    cc,
    bcc,
    status,
    includeInvoicePdf,
    includeCustomerStatement,
    stopAfterPayment,
    autoEmail,
    subject,
    body,
    createdBy,
    updatedBy,
    version,
    initialValues,
  ]);

  const previewSubject = useMemo(
    () => renderTemplate(subject || "Reminder: your invoice is overdue", SAMPLE_VALUES),
    [subject]
  );

  const previewBody = useMemo(
    () =>
      renderTemplate(
        body ||
          "Hello {customer},\n\nThis is a friendly reminder that invoice {invoice_no} for {invoice_total} remains outstanding. The balance due is {outstanding_amount} and the invoice was due on {due_date}. Please review and settle this amount at your earliest convenience.\n\nRegards,\n{company_name}",
        SAMPLE_VALUES
      ),
    [body]
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
    const nextErrors: { templateName?: string; reminderLevel?: string; subject?: string; body?: string } = {};
    if (!templateName.trim()) nextErrors.templateName = "Template name is required.";
    if (!reminderLevel.trim()) nextErrors.reminderLevel = "Reminder level is required.";
    if (!subject.trim()) nextErrors.subject = "Subject is required.";
    if (!body.trim()) nextErrors.body = "Body is required.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveTemplate(mode: "update" | "new") {
    if (!supabase || !isConfigured || !validate()) {
      setToast({ type: "error", message: "Please complete the required fields before saving." });
      return;
    }

    const client = supabase;
    setSaving(true);
    setToast(null);

    const payload = {
      template_name: templateName.trim(),
      reminder_level: reminderLevel.trim(),
      email_from: emailFrom.trim(),
      reply_to: replyTo.trim(),
      cc: cc.trim(),
      bcc: bcc.trim(),
      status: status,
      include_invoice_pdf: includeInvoicePdf,
      include_customer_statement: includeCustomerStatement,
      stop_after_payment: stopAfterPayment,
      auto_email: autoEmail,
      subject: subject.trim(),
      body: body.trim(),
      created_by: createdBy.trim() || "System",
      updated_by: updatedBy.trim() || "System",
      version: version.trim() || "1.0",
    };

    const fallbackPayload = {
      subject: subject.trim(),
      body: body.trim(),
    };

    const saveToTable = async (table: string) => {
      if (mode === "update" && templateId) {
        const fullResult = await client.from(table).update(payload).eq("id", templateId).select("id").single();
        if (!fullResult.error) return fullResult;

        return client.from(table).update(fallbackPayload).eq("id", templateId).select("id").single();
      }

      const fullResult = await client.from(table).insert(payload).select("id").single();
      if (!fullResult.error) return fullResult;

      return client.from(table).insert(fallbackPayload).select("id").single();
    };

    let result = await saveToTable("templates");
    if (result.error) {
      result = await saveToTable("reminder_templates");
    }

    if (result.error) {
      setToast({ type: "error", message: "We could not save the template. Please try again." });
    } else {
      setTemplateId(result.data?.id ?? templateId);
      setInitialValues({
        templateName,
        reminderLevel,
        emailFrom,
        replyTo,
        cc,
        bcc,
        status,
        includeInvoicePdf,
        includeCustomerStatement,
        stop_after_payment: stopAfterPayment,
        auto_email: autoEmail,
        subject,
        body,
        createdBy: createdBy.trim() || "System",
        updatedBy: updatedBy.trim() || "System",
        version: version.trim() || "1.0",
      });
      setCreatedBy(createdBy.trim() || "System");
      setUpdatedBy(updatedBy.trim() || "System");
      setVersion(version.trim() || "1.0");
      setToast({ type: "success", message: mode === "new" ? "Template created successfully." : "Reminder template saved successfully." });
    }

    setSaving(false);
  }

  function handleReset() {
    setTemplateName(initialValues.templateName);
    setReminderLevel(initialValues.reminderLevel);
    setEmailFrom(initialValues.emailFrom);
    setReplyTo(initialValues.replyTo);
    setCc(initialValues.cc);
    setBcc(initialValues.bcc);
    setStatus(initialValues.status);
    setIncludeInvoicePdf(initialValues.includeInvoicePdf);
    setIncludeCustomerStatement(initialValues.includeCustomerStatement);
    setStopAfterPayment(initialValues.stopAfterPayment);
    setAutoEmail(initialValues.autoEmail);
    setSubject(initialValues.subject);
    setBody(initialValues.body);
    setCreatedBy(initialValues.createdBy);
    setUpdatedBy(initialValues.updatedBy);
    setVersion(initialValues.version);
    setErrors({});
    setToast(null);
  }

  return (
    <>
      <PageHeader title="Reminder Template" subtitle="Configure the reminder email sent during AR follow-ups." />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="space-y-6">
          <div className="grid gap-6 2xl:grid-cols-[1.35fr_0.75fr]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveTemplate(templateId ? "update" : "new");
              }}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Reminder Template Studio</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Create and manage reminders for overdue invoices with a polished ERP-ready experience.
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
                    type="button"
                    onClick={() => setShowTestModal(true)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Send Test Email
                  </button>
                  <button
                    type="button"
                    disabled={saving || loading}
                    onClick={() => void saveTemplate("new")}
                    className="rounded-lg border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {saving ? "Saving..." : "Save as New"}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || loading}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? "Saving..." : templateId ? "Save Template" : "Create Template"}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  Loading your current template...
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-50 bg-slate-50/70 p-5">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">General Information</h4>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <FormField label="Template Name">
                        <input
                          className={`${inputClass} ${errors.templateName ? "border-rose-400" : ""}`}
                          value={templateName}
                          onChange={(event) => {
                            setTemplateName(event.target.value);
                            if (errors.templateName) setErrors((prev) => ({ ...prev, templateName: undefined }));
                          }}
                          placeholder="Overdue Invoice Reminder"
                        />
                        {errors.templateName && <p className="text-sm text-rose-600">{errors.templateName}</p>}
                      </FormField>

                      <FormField label="Reminder Level">
                        <select
                          className={`${inputClass} ${errors.reminderLevel ? "border-rose-400" : ""}`}
                          value={reminderLevel}
                          onChange={(event) => {
                            setReminderLevel(event.target.value);
                            if (errors.reminderLevel) setErrors((prev) => ({ ...prev, reminderLevel: undefined }));
                          }}
                        >
                          <option>Level 1 Reminder</option>
                          <option>Level 2 Reminder</option>
                          <option>Level 3 Reminder</option>
                          <option>Final Notice</option>
                        </select>
                        {errors.reminderLevel && <p className="text-sm text-rose-600">{errors.reminderLevel}</p>}
                      </FormField>

                      <FormField label="Email From">
                        <input
                          className={inputClass}
                          value={emailFrom}
                          onChange={(event) => setEmailFrom(event.target.value)}
                          placeholder="finance@verveadvisory.com"
                        />
                      </FormField>

                      <FormField label="Reply-To">
                        <input
                          className={inputClass}
                          value={replyTo}
                          onChange={(event) => setReplyTo(event.target.value)}
                          placeholder="collections@verveadvisory.com"
                        />
                      </FormField>

                      <FormField label="CC">
                        <input
                          className={inputClass}
                          value={cc}
                          onChange={(event) => setCc(event.target.value)}
                          placeholder="team@verveadvisory.com"
                        />
                      </FormField>

                      <FormField label="BCC">
                        <input
                          className={inputClass}
                          value={bcc}
                          onChange={(event) => setBcc(event.target.value)}
                          placeholder="archive@verveadvisory.com"
                        />
                      </FormField>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-sm font-medium text-slate-700">Status</span>
                      <button
                        type="button"
                        onClick={() => setStatus(status === "active" ? "inactive" : "active")}
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition ${status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${status === "active" ? "bg-emerald-600" : "bg-slate-500"}`} />
                        {status === "active" ? "Active" : "Inactive"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-50 bg-slate-50/70 p-5">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Email Content</h4>
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
                          placeholder="Hello {customer},\n\nWe are following up on invoice {invoice_no} for {invoice_total}..."
                        />
                        {errors.body && <p className="text-sm text-rose-600">{errors.body}</p>}
                      </FormField>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-50 bg-slate-50/70 p-5">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Email Settings</h4>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        { key: "includeInvoicePdf", label: "Include Invoice PDF", checked: includeInvoicePdf, setter: setIncludeInvoicePdf },
                        { key: "includeCustomerStatement", label: "Include Customer Statement", checked: includeCustomerStatement, setter: setIncludeCustomerStatement },
                        { key: "stopAfterPayment", label: "Stop reminders after payment", checked: stopAfterPayment, setter: setStopAfterPayment },
                        { key: "autoEmail", label: "Enable Auto Email Shoot", checked: autoEmail, setter: setAutoEmail },
                      ].map(({ key, label, checked, setter }) => (
                        <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <span className="text-sm font-medium text-slate-700">{label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(checked)}
                            onChange={(event) => setter(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </form>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Placeholders</h3>
                <p className="mt-1 text-sm text-slate-500">Group your tokens by context and insert them at the cursor instantly.</p>
                <div className="mt-4 space-y-4">
                  {PLACEHOLDER_GROUPS.map((group) => (
                    <div key={group.title}>
                      <p className="text-sm font-semibold text-slate-700">{group.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.placeholders.map((placeholder) => (
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
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Live Email Preview</h3>
                <p className="mt-1 text-sm text-slate-500">This updates instantly with sample AR values as you type.</p>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="border-b border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Preview</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{previewSubject}</p>
                  </div>
                  <div className="space-y-3 p-4 text-sm text-slate-700">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">To</p>
                      <p className="mt-1">{SAMPLE_VALUES.customer} · {SAMPLE_VALUES.customer_email}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Message</p>
                      <p className="mt-2 whitespace-pre-wrap">{previewBody}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Template Information</h3>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span>Created By</span>
                    <span className="font-medium text-slate-900">{createdBy || "System"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span>Created On</span>
                    <span className="font-medium text-slate-900">{templateId ? "Loaded from database" : "Not saved yet"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span>Updated By</span>
                    <span className="font-medium text-slate-900">{updatedBy || "System"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span>Updated On</span>
                    <span className="font-medium text-slate-900">{templateId ? "Synced with current record" : "Pending save"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span>Version</span>
                    <span className="font-medium text-slate-900">{version}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {showPreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
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
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="border-b border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Subject</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{previewSubject}</p>
                  </div>
                  <div className="p-4 text-sm text-slate-700">
                    <p className="whitespace-pre-wrap">{previewBody}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showTestModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
              <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-slate-900">Test Email</h3>
                <p className="mt-2 text-sm text-slate-600">Test email functionality will be connected later.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTestModal(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {toast && (
            <div className={`fixed bottom-4 right-4 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
              {toast.message}
            </div>
          )}
        </div>
      )}
    </>
  );
}
