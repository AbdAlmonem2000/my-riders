import * as XLSX from "xlsx";

const IQAMA_ALIASES = [
  "رقم الاقامة",
  "رقم الإقامة",
  "الاقامة",
  "الإقامة",
  "اقامة",
  "إقامة",
  "رقم الهوية",
  "الهوية",
  "iqama",
  "iqama number",
  "iqama no",
  "iqama no.",
  "residence id",
  "residence number",
  "national id",
  "id",
  "id number",
  "employee id",
  "emp id",
];

const NAME_ALIASES = [
  "اسم المندوب",
  "اسم الموظف",
  "الاسم",
  "اسم",
  "name",
  "full name",
  "rider name",
  "employee name",
  "driver name",
  "courier name",
];

const norm = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\s._-]+/g, " ")
    .trim();

export function findColumn(headers: string[], aliases: string[]): string | null {
  const map = new Map(headers.map((h) => [norm(h), h]));
  for (const alias of aliases) {
    const key = norm(alias);
    if (map.has(key)) return map.get(key)!;
  }
  // fuzzy contains
  for (const h of headers) {
    const hn = norm(h);
    for (const a of aliases) {
      const an = norm(a);
      if (hn.includes(an) || an.includes(hn)) return h;
    }
  }
  return null;
}

export interface ParsedExcel {
  headers: string[];
  rows: Record<string, unknown>[];
  iqamaColumn: string | null;
  nameColumn: string | null;
}

export async function parseExcelFile(file: File): Promise<ParsedExcel> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("الملف لا يحتوي على أوراق عمل");
  const ws = wb.Sheets[sheetName];
  // raw: false uses Excel's formatted display text (the "w" field) instead
  // of the underlying stored value — otherwise a cell formatted to show
  // "100%" comes through as the raw number 1, and dates come through as
  // serial numbers instead of readable dates.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });
  const headers =
    rows.length > 0
      ? Object.keys(rows[0])
      : (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] as string[]) || [];
  const iqamaColumn = findColumn(headers, IQAMA_ALIASES);
  const nameColumn = findColumn(headers, NAME_ALIASES);
  return { headers, rows, iqamaColumn, nameColumn };
}

export const MONTH_NAMES_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(month: number, year: number, lang: "ar" | "en" = "ar") {
  const names = lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_AR;
  return `${names[month - 1] ?? month} ${year}`;
}
