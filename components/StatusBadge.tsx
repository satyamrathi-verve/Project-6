import type { InvoiceStatus } from "@/lib/types";

/* Shared invoice status pill. Overdue = red, paid = green, open = blue, partial = amber. */
const STATUS_STYLES: Record<InvoiceStatus, string> = {
  paid: "bg-green-100 text-green-700",
  open: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
