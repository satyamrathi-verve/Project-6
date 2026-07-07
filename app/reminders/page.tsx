"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { NotConfigured } from "@/components/NotConfigured";
import { isConfigured, supabase } from "@/lib/supabase";
import type { ReminderTemplate } from "@/lib/types";

export default function ReminderTemplatePage() {
  const [template, setTemplate] = useState<ReminderTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadTemplate() {
      if (!supabase || !isConfigured) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("reminder_templates")
        .select("*")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setTemplate(data as ReminderTemplate);
        setSubject(data.subject ?? "");
        setBody(data.body ?? "");
      }

      setLoading(false);
    }

    loadTemplate();
  }, []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !isConfigured) return;

    setSaving(true);
    setMessage(null);

    let result;

    if (template?.id) {
      result = await supabase
        .from("reminder_templates")
        .update({ subject, body })
        .eq("id", template.id)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("reminder_templates")
        .insert([{ name: "Default", subject, body }])
        .select("*")
        .single();
    }

    if (result.error) {
      setMessage("Unable to save the reminder template right now.");
    } else {
      setTemplate(result.data as ReminderTemplate);
      setMessage("Reminder template saved.");
    }

    setSaving(false);
  }

  return (
    <>
      <PageHeader
        title="AR Followup — Reminder Template"
        subtitle="Edit the message used for overdue invoice reminders"
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Email template</h3>
                <p className="mt-1 text-sm text-slate-500">
                  This is the message your team will use when chasing overdue invoices.
                </p>
              </div>
              <button
                type="submit"
                disabled={saving || loading}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? "Saving..." : "Save template"}
              </button>
            </div>

            {message && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </div>
            )}

            <div className="space-y-4">
              <FormField label="Template name">
                <input
                  className={`${inputClass} bg-slate-50`}
                  value={template?.name ?? "Default"}
                  readOnly
                />
              </FormField>

              <FormField label="Subject">
                <input
                  className={inputClass}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Reminder: invoice {invoice_no} is overdue"
                />
              </FormField>

              <FormField label="Message body">
                <textarea
                  className={`${inputClass} min-h-[280px] resize-y`}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Hello {customer}, your invoice {invoice_no} for {amount} is overdue by {days_overdue} days."
                />
              </FormField>
            </div>
          </form>

          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Placeholders</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>• {'{customer}'} — customer name</li>
                <li>• {'{amount}'} — outstanding amount</li>
                <li>• {'{days_overdue}'} — days late</li>
                <li>• {'{invoice_no}'} — invoice number</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Preview</h3>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Subject</p>
                <p className="mt-1">{subject || "Your reminder subject will appear here"}</p>
                <p className="mt-4 font-medium text-slate-900">Body</p>
                <p className="mt-1 whitespace-pre-wrap">{body || "Your reminder body will appear here"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
