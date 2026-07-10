"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { parseCsv, toCsv, downloadCsv, type CsvRow } from "@/lib/csv";

/*
  Reusable "bulk import from CSV" block. Drop it into any data-entry screen
  alongside its normal add/edit form. Each screen supplies:
    - a sample template (headers + example rows) users can download and fill in
    - groupRows: turns the raw parsed CSV into one item per record to insert
      (a plain 1-row-per-record entity, or several rows grouped into one parent
      + child rows, e.g. an invoice with multiple line items)
    - onImport: actually inserts the valid items through the Supabase client
  It never talks to the backend itself — that stays in each screen.
*/

export interface CsvImportGroup<T> {
  /** Stable identifier for this row/group, used as the React key and to report results. */
  key: string;
  /** What shows in the preview list, e.g. "CUST-101" or "INV-1042 (3 line items)". */
  label: string;
  /** The parsed, ready-to-insert payload — null when errors make it un-importable. */
  data: T | null;
  errors: string[];
}

export interface CsvImportResult {
  key: string;
  ok: boolean;
  message: string;
}

export function CsvImport<T>({
  title,
  description,
  templateFilename,
  templateHeaders,
  templateSampleRows,
  groupRows,
  onImport,
  onImported,
}: {
  title: string;
  description: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSampleRows: string[][];
  groupRows: (rows: CsvRow[]) => CsvImportGroup<T>[];
  onImport: (items: T[]) => Promise<CsvImportResult[]>;
  /** Called after an import finishes with at least one success, e.g. to refresh a list. */
  onImported?: () => void;
}) {
  const [groups, setGroups] = useState<CsvImportGroup<T>[]>([]);
  const [results, setResults] = useState<Record<string, CsvImportResult>>({});
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validCount = groups.filter((g) => g.data && g.errors.length === 0).length;
  const errorCount = groups.length - validCount;

  function handleDownloadTemplate() {
    downloadCsv(templateFilename, toCsv(templateHeaders, templateSampleRows));
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults({});
    const text = await file.text();
    const rows = parseCsv(text).filter((r) => Object.values(r).some((v) => v.trim() !== ""));
    setGroups(groupRows(rows));
  }

  async function handleImport() {
    const validItems = groups.filter((g) => g.data && g.errors.length === 0).map((g) => g.data as T);
    if (validItems.length === 0) return;

    setImporting(true);
    const outcomes = await onImport(validItems);
    const byKey: Record<string, CsvImportResult> = {};
    outcomes.forEach((o) => {
      byKey[o.key] = o;
    });
    setResults(byKey);
    setImporting(false);

    if (outcomes.some((o) => o.ok)) onImported?.();
  }

  function handleReset() {
    setGroups([]);
    setResults({});
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <div className="flex flex-none flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Download sample CSV
          </button>
          <label className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90">
            Upload CSV
            <input ref={inputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          </label>
        </div>
      </div>

      {fileName && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            <span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{fileName}</span> — {groups.length} row(s) found,{" "}
              <span className="text-emerald-600 dark:text-emerald-400">{validCount} ready</span>
              {errorCount > 0 && <span className="text-rose-600 dark:text-rose-400">, {errorCount} with errors</span>}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={validCount === 0 || importing}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {importing ? "Importing..." : `Import ${validCount} row(s)`}
              </button>
            </div>
          </div>

          {groups.length > 0 && (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                  <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                    <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">Row</th>
                    <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const result = results[g.key];
                    return (
                      <tr key={g.key} className="border-b border-slate-100 last:border-0 dark:border-slate-700/60">
                        <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{g.label}</td>
                        <td className="px-4 py-2">
                          {result ? (
                            <span className={result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                              {result.ok ? `Imported — ${result.message}` : result.message}
                            </span>
                          ) : g.errors.length > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400">{g.errors.join("; ")}</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">Ready to import</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
