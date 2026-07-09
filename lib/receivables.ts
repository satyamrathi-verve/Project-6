import type { Invoice, InvoiceStatus } from "@/lib/types";

export type InvoiceWithAllocations = Invoice & {
  receipt_allocations?: { amount: number }[] | null;
};

/** Outstanding on an invoice = total minus the sum of its receipt allocations. */
export function outstandingOf(invoice: InvoiceWithAllocations): number {
  const received = (invoice.receipt_allocations ?? []).reduce((sum, a) => sum + Number(a.amount), 0);
  return Number(invoice.total) - received;
}

/**
 * Live status per the AR rule: overdue = status is open/partial AND due_date
 * is in the past. The stored `status` column only gets refreshed when a
 * receipt is entered, so screens that display status should compute this
 * instead of trusting the raw column.
 */
export function effectiveStatus(invoice: Pick<Invoice, "status" | "due_date">, outstanding: number): InvoiceStatus {
  if (invoice.status === "paid" || outstanding <= 0) return "paid";
  if (new Date(invoice.due_date) < new Date()) return "overdue";
  return invoice.status === "overdue" ? "open" : invoice.status;
}

/** Add `days` calendar days to a YYYY-MM-DD date string. */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
