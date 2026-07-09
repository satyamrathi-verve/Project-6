import { supabase } from "@/lib/supabase";
import type { CsvRow } from "@/lib/csv";
import type { CsvImportGroup, CsvImportResult } from "@/components/CsvImport";
import { addDays } from "@/lib/receivables";
import type { Customer, InvoiceStatus } from "@/lib/types";

/*
  Shared bulk-import logic for Sales Invoices, used by both the inline
  "Bulk import invoices" panel on that screen and the standalone Upload
  Report screen — one copy of the template/validation/insert logic so the
  two entry points can't drift apart.
*/

export type InvoiceLineInput = { description: string; qty: number; rate: number; amount: number };

export type InvoiceGroupInsert = {
  invoice_no: string;
  invoice_date: string;
  customer_id: string;
  customer_code: string;
  due_date: string;
  created_at?: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  items: InvoiceLineInput[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALUES: InvoiceStatus[] = ["open", "partial", "paid", "overdue"];

// Header names match what the team asked for; each maps onto the actual
// `invoices` / `invoice_items` columns in supabase/seed.sql. `rate` has to
// stay (there's no way to get a line's value from quantity alone), and
// `tax_amount` is the closest real equivalent to tax%/IGST/CGST/SGST — the
// schema only stores one combined tax figure per invoice, not a per-line
// split. Fields with no home in the schema (sales order #, item code, unit,
// discount, currency, created by) aren't part of the template.
export const INVOICE_CSV_TEMPLATE_HEADERS = [
  "invoice_date",
  "invoice_number",
  "customer_id",
  "customer_name",
  "due_date",
  "created_date",
  "tax_amount",
  "remarks",
  "item_description",
  "quantity",
  "rate",
];

export const INVOICE_CSV_TEMPLATE_SAMPLE_ROWS = [
  ["2026-07-01", "INV-2001", "CUST-101", "Acme Traders", "", "2026-07-01", "900", "", "Consulting services - June", "10", "1500"],
  ["2026-07-01", "INV-2001", "CUST-101", "Acme Traders", "", "2026-07-01", "900", "", "Travel reimbursement", "1", "2000"],
  ["2026-07-03", "INV-2002", "CUST-102", "Bright Textiles", "2026-08-02", "2026-07-03", "0", "Urgent delivery surcharge", "Express delivery", "2", "750"],
];

/** `customersByCode` resolves each row's human-readable customer_id (e.g. "CUST-101") to the real customer. */
export function groupInvoiceRows(customersByCode: Map<string, Customer>, rows: CsvRow[]): CsvImportGroup<InvoiceGroupInsert>[] {
  const order: string[] = [];
  const byInvoiceNo = new Map<string, CsvRow[]>();

  rows.forEach((row) => {
    const key = row.invoice_number?.trim();
    if (!key) return;
    if (!byInvoiceNo.has(key)) {
      order.push(key);
      byInvoiceNo.set(key, []);
    }
    byInvoiceNo.get(key)!.push(row);
  });

  // Rows with no invoice_number at all can't be grouped — surface them as their own error entries.
  const orphanRows = rows.filter((r) => !r.invoice_number?.trim());

  const groups: CsvImportGroup<InvoiceGroupInsert>[] = order.map((invoiceNo) => {
    const lines = byInvoiceNo.get(invoiceNo)!;
    const header = lines[0];
    const errors: string[] = [];

    const invoiceDate = header.invoice_date?.trim();
    const customerCode = header.customer_id?.trim();
    const customer = customerCode ? customersByCode.get(customerCode) : undefined;

    if (!invoiceDate || !DATE_RE.test(invoiceDate)) errors.push("invoice_date must be YYYY-MM-DD");
    if (!customerCode) errors.push("customer_id is required");
    else if (!customer) errors.push(`customer_id "${customerCode}" not found`);

    let dueDate = header.due_date?.trim();
    if (dueDate && !DATE_RE.test(dueDate)) errors.push("due_date must be YYYY-MM-DD");
    if (!dueDate && invoiceDate && DATE_RE.test(invoiceDate) && customer) {
      dueDate = addDays(invoiceDate, customer.credit_days);
    }

    const createdDate = header.created_date?.trim();
    if (createdDate && !DATE_RE.test(createdDate)) errors.push("created_date must be YYYY-MM-DD");

    const items: InvoiceLineInput[] = [];
    lines.forEach((line, i) => {
      const description = line.item_description?.trim();
      const qty = Number(line.quantity);
      const rate = Number(line.rate);
      if (!description) {
        errors.push(`line ${i + 1}: item_description is required`);
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push(`line ${i + 1}: quantity must be a positive number`);
        return;
      }
      if (!Number.isFinite(rate) || rate < 0) {
        errors.push(`line ${i + 1}: rate must be a number`);
        return;
      }
      items.push({ description, qty, rate, amount: qty * rate });
    });

    if (items.length === 0 && errors.length === 0) errors.push("needs at least one line item");

    const taxAmount = Number(header.tax_amount);
    const tax = Number.isFinite(taxAmount) ? taxAmount : 0;
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const statusValue = (header.status?.trim().toLowerCase() as InvoiceStatus) || "open";
    const status = STATUS_VALUES.includes(statusValue) ? statusValue : "open";

    const data: InvoiceGroupInsert | null =
      errors.length === 0
        ? {
            invoice_no: invoiceNo,
            invoice_date: invoiceDate!,
            customer_id: customer!.id,
            customer_code: customerCode!,
            due_date: dueDate!,
            ...(createdDate ? { created_at: createdDate } : {}),
            subtotal,
            tax_amount: tax,
            total: subtotal + tax,
            status,
            notes: header.remarks?.trim() || null,
            items,
          }
        : null;

    return {
      key: invoiceNo,
      label: `${invoiceNo} (${lines.length} line${lines.length === 1 ? "" : "s"})`,
      data,
      errors,
    };
  });

  orphanRows.forEach((row, i) => {
    groups.push({
      key: `orphan-${i}`,
      label: `Row without invoice_number (${row.item_description || "unlabeled"})`,
      data: null,
      errors: ["invoice_number is required"],
    });
  });

  return groups;
}

export async function importInvoices(items: InvoiceGroupInsert[]): Promise<CsvImportResult[]> {
  if (!supabase) return items.map((item) => ({ key: item.invoice_no, ok: false, message: "Supabase is not connected." }));

  const results: CsvImportResult[] = [];
  for (const item of items) {
    const { items: lines, customer_code, ...header } = item;

    const invoiceInsert = await supabase.from("invoices").insert(header).select("id").single();
    if (invoiceInsert.error || !invoiceInsert.data) {
      results.push({
        key: item.invoice_no,
        ok: false,
        message: invoiceInsert.error?.message.includes("duplicate") ? "invoice_no already exists" : "insert failed",
      });
      continue;
    }

    const invoiceId = invoiceInsert.data.id as string;
    const lineInsert = await supabase
      .from("invoice_items")
      .insert(lines.map((line) => ({ ...line, invoice_id: invoiceId })));

    if (lineInsert.error) {
      await supabase.from("invoices").delete().eq("id", invoiceId);
      results.push({ key: item.invoice_no, ok: false, message: "line items failed, invoice rolled back" });
      continue;
    }

    results.push({ key: item.invoice_no, ok: true, message: `${customer_code} — ₹${item.total.toLocaleString("en-IN")}` });
  }
  return results;
}
