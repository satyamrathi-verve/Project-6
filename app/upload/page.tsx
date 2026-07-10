"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { CsvImport } from "@/components/CsvImport";
import { isConfigured, supabase } from "@/lib/supabase";
import {
  CUSTOMER_CSV_TEMPLATE_HEADERS,
  CUSTOMER_CSV_TEMPLATE_SAMPLE_ROWS,
  groupCustomerRows,
  importCustomers,
} from "@/lib/csvImportCustomers";
import {
  INVOICE_CSV_TEMPLATE_HEADERS,
  INVOICE_CSV_TEMPLATE_SAMPLE_ROWS,
  groupInvoiceRows,
  importInvoices,
} from "@/lib/csvImportInvoices";
import type { CsvRow } from "@/lib/csv";
import type { Customer } from "@/lib/types";

/*
  Upload Report: a single dedicated place to bulk-import either Customer
  Master or Sales Invoice data from a CSV, using the same template/
  validation/insert logic as the inline "Bulk import" panels already on
  those two screens (see lib/csvImportCustomers.ts and lib/csvImportInvoices.ts)
  — this is a second entry point to that same logic, not a separate copy of it.
*/

type UploadType = "customers" | "invoices";

const TYPES: { value: UploadType; label: string }[] = [
  { value: "customers", label: "Customer Master" },
  { value: "invoices", label: "Sales Invoices" },
];

export default function UploadReportPage() {
  const [activeType, setActiveType] = useState<UploadType>("customers");
  const [customers, setCustomers] = useState<Customer[]>([]);

  async function loadCustomers() {
    if (!supabase) return;
    const { data } = await supabase.from("customers").select("*").order("name", { ascending: true });
    setCustomers((data as Customer[]) ?? []);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  const customersByCode = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.code, c));
    return map;
  }, [customers]);

  function handleGroupInvoiceRows(rows: CsvRow[]) {
    return groupInvoiceRows(customersByCode, rows);
  }

  return (
    <div>
      <PageHeader
        title="Upload Report"
        subtitle="Bulk import customers or sales invoices from a CSV — the same tool available on those screens, in one place."
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <div className="space-y-5">
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setActiveType(t.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  activeType === t.value
                    ? "border-brand bg-brand text-white"
                    : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeType === "customers" ? (
            <CsvImport
              title="Bulk import customers"
              description="Download the sample CSV, fill in as many customers as you like, then upload it to add them all at once. (Fields like status, shipping address, currency, and bank details aren't tracked yet — only what's listed here is stored.)"
              templateFilename="customers_template.csv"
              templateHeaders={CUSTOMER_CSV_TEMPLATE_HEADERS}
              templateSampleRows={CUSTOMER_CSV_TEMPLATE_SAMPLE_ROWS}
              groupRows={groupCustomerRows}
              onImport={importCustomers}
              onImported={loadCustomers}
            />
          ) : (
            <CsvImport
              title="Bulk import invoices"
              description="Download the sample CSV, add one row per line item (repeat the invoice_number to group lines under one invoice), then upload. Totals are calculated automatically. (Sales order #, item code, unit, discount, tax%, IGST/CGST/SGST and currency aren't tracked yet — only what's listed here is stored.)"
              templateFilename="invoices_template.csv"
              templateHeaders={INVOICE_CSV_TEMPLATE_HEADERS}
              templateSampleRows={INVOICE_CSV_TEMPLATE_SAMPLE_ROWS}
              groupRows={handleGroupInvoiceRows}
              onImport={importInvoices}
            />
          )}
        </div>
      )}
    </div>
  );
}
