/**
 * Minimal RFC-4180-ish CSV parser.
 *
 * Supports comma-separated values, optional double-quoted fields with the
 * standard `""` escape for embedded quotes, and CR/LF or LF line endings.
 * The first line is treated as the header row and used to key the returned
 * rows. Blank lines are skipped.
 *
 * The project has no `csv-parse` / `papaparse` / `fast-csv` dependency, and
 * the bulk-import payload is small and trusted enough that this hand-rolled
 * parser is sufficient. If a future task needs streaming or escaping rules
 * we don't cover, swap this out for a library.
 */

export interface CsvDocument {
  headers: string[];
  rows: Record<string, string>[];
}

export class CsvParseError extends Error {
  readonly name = 'CsvParseError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function parseCsv(content: string): CsvDocument {
  // Strip UTF-8 BOM if present.
  const normalised = content.replace(/^﻿/, '');
  const lines = tokenizeLines(normalised);

  if (lines.length === 0) {
    throw new CsvParseError('CSV is empty.');
  }

  const headers = lines[0]!.map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => h === '')) {
    throw new CsvParseError('CSV header row is empty.');
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!;
    // Skip rows that are entirely empty (e.g. trailing newline).
    if (cells.length === 1 && cells[0] === '') continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = cells[j] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

function tokenizeLines(content: string): string[][] {
  const lines: string[][] = [];
  let cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' && current === '') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      cells.push(current);
      current = '';
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      // Treat \r\n as a single newline.
      if (ch === '\r' && content[i + 1] === '\n') i++;
      cells.push(current);
      lines.push(cells);
      cells = [];
      current = '';
      continue;
    }

    current += ch;
  }

  // Flush trailing cell / line if the file does not end with a newline.
  if (current !== '' || cells.length > 0) {
    cells.push(current);
    lines.push(cells);
  }

  return lines;
}
