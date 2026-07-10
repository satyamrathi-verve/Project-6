"use client";

import { useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Optional custom cell; defaults to String(row[key]). */
  render?: (row: T) => ReactNode;
  className?: string;
  /** Lets the header be clicked to sort by this column (needs sortKey/sortDir/onSort on DataTable). */
  sortable?: boolean;
  /** Dropdown content shown when the column's filter button is clicked. Call close() to dismiss it (e.g. after picking a value). */
  filter?: (close: () => void) => ReactNode;
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5L1 2z" />
    </svg>
  );
}

/*
  A plain, reusable table. Copy this pattern for every list screen (invoices,
  receipts, GL accounts…). Pass your columns and rows; it handles the empty state.
  Pass sortKey/sortDir/onSort to make `sortable` column headers clickable, `filter`
  on a column to add an Excel-style filter dropdown to its header, footerRow for a
  pinned totals/summary row, and rowClassName to style individual rows.
*/
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty = "Nothing here yet.",
  sortKey,
  sortDir,
  onSort,
  footerRow,
  rowClassName,
  tableClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  /** Optional totals/summary row rendered pinned below the body, outside the empty-state check. */
  footerRow?: ReactNode;
  /** Optional per-row className, e.g. to highlight a row. */
  rowClassName?: (row: T) => string;
  /** Optional extra class on the <table> itself, e.g. "table-fixed" to distribute columns evenly. */
  tableClassName?: string;
}) {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const hasFilters = columns.some((c) => c.filter);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${hasFilters ? "" : "overflow-hidden"}`}>
      <table className={`w-full text-sm ${tableClassName ?? ""}`}>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-900/40">
            {columns.map((c, i) => (
              <th
                key={c.key}
                className={`relative px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 ${
                  i === 0 ? "rounded-tl-xl" : ""
                } ${i === columns.length - 1 ? "rounded-tr-xl" : ""} ${c.className ?? ""}`}
              >
                <div className="flex items-center gap-1.5">
                  {c.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      {c.header}
                      <span className="w-3 text-[10px] text-slate-400 dark:text-slate-500">
                        {sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                  {c.filter && (
                    <button
                      type="button"
                      onClick={() => setOpenFilter(openFilter === c.key ? null : c.key)}
                      aria-label={`Filter ${c.header}`}
                      className={`rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 ${
                        openFilter === c.key ? "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      <FilterIcon />
                    </button>
                  )}
                </div>
                {c.filter && openFilter === c.key && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 font-normal normal-case tracking-normal text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {c.filter(() => setOpenFilter(null))}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/40 ${
                  rowClassName ? rowClassName(row) : ""
                }`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-slate-700 dark:text-slate-300 ${c.className ?? ""}`}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footerRow && rows.length > 0 && <tfoot>{footerRow}</tfoot>}
      </table>
      {openFilter && <div className="fixed inset-0 z-40" onClick={() => setOpenFilter(null)} />}
    </div>
  );
}
