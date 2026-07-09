import { supabase } from "@/lib/supabase";
import type { CsvRow } from "@/lib/csv";
import type { CsvImportGroup, CsvImportResult } from "@/components/CsvImport";
import type { Customer } from "@/lib/types";

/*
  Shared bulk-import logic for Customer Master, used by both the inline
  "Bulk import customers" panel on that screen and the standalone Upload
  Report screen — one copy of the template/validation/insert logic so the
  two entry points can't drift apart.
*/

export type CustomerInsert = Omit<Customer, "id" | "created_at"> & { created_at?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Header names match what the team asked for; each maps onto the actual
// `customers` columns in supabase/seed.sql (see the parsing below). Fields
// that don't exist in that table — status, shipping address, currency,
// payment terms, bank details, created by — aren't included here because
// there's nowhere in the shared database to store them.
export const CUSTOMER_CSV_TEMPLATE_HEADERS = [
  "customer_id",
  "customer_name",
  "gstin",
  "email_address",
  "contact_number",
  "billing_address",
  "pan",
  "contact_person",
  "credit_limit",
  "credit_days",
  "opening_balance",
  "created_date",
];

export const CUSTOMER_CSV_TEMPLATE_SAMPLE_ROWS = [
  [
    "CUST-101",
    "Acme Traders",
    "29ABCDE1234F1Z5",
    "rahul@acmetraders.com",
    "9876543210",
    "123 MG Road, Bengaluru",
    "ABCDE1234F",
    "Rahul Shah",
    "500000",
    "45",
    "0",
    "2026-01-15",
  ],
  [
    "CUST-102",
    "Bright Textiles",
    "",
    "priya@brighttex.com",
    "9123456780",
    "45 Anna Salai, Chennai",
    "",
    "Priya Nair",
    "250000",
    "30",
    "15000",
    "",
  ],
];

function toNumber(value: string, fallback: number): number {
  if (value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validateCustomerRow(row: CsvRow): { data: CustomerInsert | null; errors: string[] } {
  const errors: string[] = [];
  const code = row.customer_id?.trim();
  const name = row.customer_name?.trim();

  if (!code) errors.push("customer_id is required");
  if (!name) errors.push("customer_name is required");

  const createdDate = row.created_date?.trim();
  if (createdDate && !DATE_RE.test(createdDate)) errors.push("created_date must be YYYY-MM-DD");

  if (errors.length > 0) return { data: null, errors };

  return {
    data: {
      code: code!,
      name: name!,
      gstin: row.gstin?.trim() || null,
      pan: row.pan?.trim() || null,
      contact_person: row.contact_person?.trim() || null,
      email: row.email_address?.trim() || null,
      phone: row.contact_number?.trim() || null,
      address: row.billing_address?.trim() || null,
      credit_limit: toNumber(row.credit_limit, 0),
      credit_days: toNumber(row.credit_days, 30),
      opening_balance: toNumber(row.opening_balance, 0),
      status: "active",
      ...(createdDate ? { created_at: createdDate } : {}),
    },
    errors: [],
  };
}

export function groupCustomerRows(rows: CsvRow[]): CsvImportGroup<CustomerInsert>[] {
  return rows.map((row, index) => {
    const { data, errors } = validateCustomerRow(row);
    const label = row.customer_id?.trim() || `Row ${index + 2}`;
    return { key: `${label}-${index}`, label, data, errors };
  });
}

export async function importCustomers(items: CustomerInsert[]): Promise<CsvImportResult[]> {
  if (!supabase) return items.map((item) => ({ key: item.code, ok: false, message: "Supabase is not connected." }));

  const results: CsvImportResult[] = [];
  for (const item of items) {
    const { error: insertError } = await supabase.from("customers").insert(item);
    if (insertError) {
      results.push({
        key: item.code,
        ok: false,
        message: insertError.message.includes("duplicate") ? "code already exists" : "insert failed",
      });
    } else {
      results.push({ key: item.code, ok: true, message: item.name });
    }
  }
  return results;
}
