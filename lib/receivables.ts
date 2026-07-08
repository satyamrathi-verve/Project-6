import type { Invoice } from "@/lib/types";

export type InvoiceWithAllocations = Invoice & {
  receipt_allocations?: { amount: number }[] | null;
};

/** Outstanding on an invoice = total minus the sum of its receipt allocations. */
export function outstandingOf(invoice: InvoiceWithAllocations): number {
  const received = (invoice.receipt_allocations ?? []).reduce((sum, a) => sum + Number(a.amount), 0);
  return Number(invoice.total) - received;
}
