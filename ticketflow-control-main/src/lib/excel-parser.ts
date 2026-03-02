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
  const ms = serial * 24 * 60 * 60 * 1000;
  const result = new Date(base.getTime() + ms);
  return new Date(result.getFullYear(), result.getMonth(), result.getDate());
}

function parseAnyDate(raw: unknown, refYear: number, refMonth: number): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;

  // Excel Serial Number
  if (typeof raw === 'number') {
    return excelSerialToDate(raw);
  }

  const text = String(raw).trim();

  // ISO Format: YYYY-MM-DD (z.B. "2026-01-06")
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10)
    );
  }

  // DD.MM.YYYY
  const fullMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (fullMatch) {
    return new Date(
      parseInt(fullMatch[3], 10),
      parseInt(fullMatch[2], 10) - 1,
      parseInt(fullMatch[1], 10)
    );
  }

  // DD.MM.YY
  const shortYearMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (shortYearMatch) {
    const yy = parseInt(shortYearMatch[3], 10);
    const year = yy <= 50 ? 2000 + yy : 1900 + yy;
    return new Date(year, parseInt(shortYearMatch[2], 10) - 1, parseInt(shortYearMatch[1], 10));
  }

  // DD.MM. (ohne Jahr)
  const shortMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (shortMatch) {
    const month = parseInt(shortMatch[2], 10);
    const day = parseInt(shortMatch[1], 10);
    const year = month > refMonth ? refYear - 1 : refYear;
    return new Date(year, month - 1, day);
  }

  return null;
}

function normalizeTicketNummer(raw: unknown, refYear: number): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!str) return null;

  const withPrefix = str.match(/^A(\d{2})-?(\d{4,6})$/);
  if (withPrefix) {
    return `A${withPrefix[1]}-${withPrefix[2].padStart(5, '0')}`;
  }

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

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || row.length === 0) continue;

    const rawNummer = row[0];
    const rawDatum = row[1];
    const rawHochbau = row[2];
    const rawElektro = row[3];

    if (!rawNummer) continue;

    const a_nummer = normalizeTicketNummer(rawNummer, refYear);
    if (!a_nummer) {
      warnings.push(`Zeile ${i + 1}: Ungültige Ticket-Nr. "${rawNummer}" – übersprungen`);
      continue;
    }

    // Datum parsen – unterstützt jetzt alle Formate inkl. ISO
    const eingangsdatum = parseAnyDate(rawDatum, refYear, refMonth);
    if (rawDatum && !eingangsdatum) {
      warnings.push(`Zeile ${i + 1}: Datum "${rawDatum}" nicht erkannt`);
    }

    const elektroMark = String(rawElektro ?? '').trim().toLowerCase();
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
