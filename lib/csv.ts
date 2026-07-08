/*
  Minimal CSV helpers (no external dependency): parse an uploaded file's text
  into rows keyed by header, and generate/download a template CSV. Handles
  quoted fields with embedded commas/newlines (basic RFC4180).
*/

export type CsvRow = Record<string, string>;

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // ignore; \n will trigger the row push
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Parses CSV text into rows keyed by the header row. Blank rows are skipped. */
export function parseCsv(text: string): CsvRow[] {
  const lines = parseCsvLines(text);
  if (lines.length === 0) return [];

  const headers = lines[0].map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const row: CsvRow = {};
    headers.forEach((header, i) => {
      row[header] = (line[i] ?? "").trim();
    });
    return row;
  });
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds CSV text from a header row and data rows. */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCsvField).join(",")).join("\n");
}

/** Triggers a browser download of the given CSV text. */
export function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
