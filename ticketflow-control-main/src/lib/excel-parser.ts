import * as XLSX from 'xlsx';

export interface ParsedTicketRow {
  a_nummer: string;
  gewerk: 'Hochbau' | 'Elektro';
  eingangsdatum: Date | null;
  rowIndex: number;
  isDuplicate: boolean;
  warning?: string;
}

export interface ExcelParseResult {
  rows: ParsedTicketRow[];
  errors: string[];
  warnings: string[];
}

function excelSerialToDate(serial: number): Date {
  const base = new Date(1899, 11, 30);
  const result = new Date(base.getTime() + serial * 24 * 60 * 60 * 1000);
  return new Date(result.getFullYear(), result.getMonth(), result.getDate());
}

// Jahr aus A-Nummer extrahieren: A26-xxxxx → 2026, A25-xxxxx → 2025
function yearFromANummer(a_nummer: string): number | null {
  const match = a_nummer.match(/^A(\d{2})-/);
  if (!match) return null;
  const yy = parseInt(match[1], 10);
  return yy <= 50 ? 2000 + yy : 1900 + yy;
}

function parseAnyDate(raw: unknown, ticketYear: number, refMonth: number): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;

  // Excel Serial Number
  if (typeof raw === 'number') {
    const d = excelSerialToDate(raw);
    // Serial-Datum: Jahr muss plausibel sein (2020-2030)
    if (d.getFullYear() >= 2020 && d.getFullYear() <= 2030) return d;
    return null;
  }

  const text = String(raw).trim();

  // ISO Format: YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // DD.MM.YYYY – volles Jahr vorhanden, direkt übernehmen
  const fullMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (fullMatch) {
    return new Date(parseInt(fullMatch[3]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[1]));
  }

  // DD.MM.YY – zweistelliges Jahr
  const shortYearMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (shortYearMatch) {
    const yy = parseInt(shortYearMatch[3], 10);
    const year = yy <= 50 ? 2000 + yy : 1900 + yy;
    return new Date(year, parseInt(shortYearMatch[2]) - 1, parseInt(shortYearMatch[1]));
  }

  // DD.MM. – NUR Monat und Tag, kein Jahr
  // → Jahr kommt aus der A-Nummer! Das ist die zuverlässigste Quelle.
  const shortMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (shortMatch) {
    const month = parseInt(shortMatch[2], 10);
    const day = parseInt(shortMatch[1], 10);
    // ticketYear kommt direkt aus der A-Nummer (A25 = 2025, A26 = 2026)
    return new Date(ticketYear, month - 1, day);
  }

  return null;
}

function normalizeTicketNummer(raw: unknown, refYear: number): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!str) return null;

  // A26-00001 oder A26-1234
  const withPrefix = str.match(/^A(\d{2})-?(\d{4,6})$/);
  if (withPrefix) {
    return `A${withPrefix[1]}-${withPrefix[2].padStart(5, '0')}`;
  }

  // Nur Zahlen → Jahr aus refYear
  const numMatch = str.match(/^(\d{3,6})$/);
  if (numMatch) {
    const yy = String(refYear).slice(-2);
    return `A${yy}-${numMatch[1].padStart(5, '0')}`;
  }

  return null;
}

export function parseExcelFile(
  buffer: ArrayBuffer,
  refYearMonth: string
): ExcelParseResult {
  const [refYearStr, refMonthStr] = refYearMonth.split('-');
  const refYear = parseInt(refYearStr, 10);
  const refMonth = parseInt(refMonthStr, 10);

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ParsedTicketRow[] = [];
  const seenNummern = new Map<string, number>();

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || row.length === 0 || !row[0]) continue;

    const a_nummer = normalizeTicketNummer(row[0], refYear);
    if (!a_nummer) {
      warnings.push(`Zeile ${i + 1}: Ungültige Ticket-Nr. "${row[0]}" – übersprungen`);
      continue;
    }

    // Jahr direkt aus A-Nummer lesen – das ist die Wahrheit
    const ticketYear = yearFromANummer(a_nummer) ?? refYear;

    // Datum parsen mit ticketYear als Grundlage
    const eingangsdatum = parseAnyDate(row[1], ticketYear, refMonth);
    if (row[1] && !eingangsdatum) {
      warnings.push(`Zeile ${i + 1}: Datum "${row[1]}" nicht erkannt`);
    }

    // Sanity-Check: Jahr im Datum muss zum Jahr in A-Nummer passen
    if (eingangsdatum && eingangsdatum.getFullYear() !== ticketYear) {
      warnings.push(`Zeile ${i + 1}: Datum-Jahr ${eingangsdatum.getFullYear()} ≠ A-Nummer-Jahr ${ticketYear} – Datum korrigiert`);
      eingangsdatum.setFullYear(ticketYear);
    }

    const elektroMark = String(row[3] ?? '').trim().toLowerCase();
    const gewerk: 'Hochbau' | 'Elektro' = elektroMark === 'x' ? 'Elektro' : 'Hochbau';

    let isDuplicate = false;
    if (seenNummern.has(a_nummer)) {
      isDuplicate = true;
      warnings.push(`Zeile ${i + 1}: Duplikat von Zeile ${seenNummern.get(a_nummer)} (${a_nummer})`);
    } else {
      seenNummern.set(a_nummer, i + 1);
    }

    rows.push({ a_nummer, gewerk, eingangsdatum, rowIndex: i + 1, isDuplicate });
  }

  return { rows, errors, warnings };
}
