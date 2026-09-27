import * as XLSX from "xlsx";

// Kept separate from ID_ALIASES (rather than one merged list) so a sheet
// that has *both* an Iqama column and a distinct ID column — same rider,
// two different lookup numbers — gets both detected instead of one column
// winning and the other's values becoming unsearchable.
const IQAMA_ALIASES = [
  "رقم الاقامة",
  "رقم الإقامة",
  "الاقامة",
  "الإقامة",
  "اقامة",
  "إقامة",
  "iqama",
  "iqama number",
  "iqama no",
  "iqama no.",
  "residence id",
  "residence number",
];

const ID_ALIASES = [
  "رقم الهوية",
  "الهوية",
  "هوية",
  "national id",
  "id",
  "id number",
  "employee id",
  "emp id",
];

// The rider's photo is provided as a plain link in the directory sheet
// (Google Drive, a CDN, etc.) — stored and shown as-is.
const PHOTO_ALIASES = [
  "صورة",
  "الصورة",
  "الصوره",
  "صوره",
  "صورة المندوب",
  "صوره المندوب",
  "رابط الصورة",
  "لينك الصورة",
  "photo",
  "photo url",
  "photo link",
  "image",
  "image url",
  "picture",
  "avatar",
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

const AREA_ALIASES = [
  "المنطقة",
  "منطقة",
  "المنطقه",
  "منطقه",
  "منطقة العمل",
  "المدينة",
  "مدينة",
  "area",
  "region",
  "city",
  "location",
  "zone",
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
  idColumn: string | null;
  nameColumn: string | null;
  photoColumn: string | null;
  areaColumn: string | null;
}

export async function parseExcelFile(file: File): Promise<ParsedExcel> {
  const isCsv = /\.csv$/i.test(file.name) || /csv/i.test(file.type);
  // SheetJS reads CSV as well as .xlsx/.xls, and auto-detects the delimiter
  // (comma / semicolon / tab). Arabic CSV is only reliably decoded when read
  // as text via file.text() (always UTF-8) — the byte-array path guesses a
  // codepage and can mojibake Arabic names.
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
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
  let idColumn = findColumn(headers, ID_ALIASES);
  // Fuzzy matching can land both detectors on the same header (e.g. a
  // column literally named "Iqama ID") — don't treat one column as two
  // distinct identifiers.
  if (idColumn && idColumn === iqamaColumn) idColumn = null;
  const nameColumn = findColumn(headers, NAME_ALIASES);
  let photoColumn = findColumn(headers, PHOTO_ALIASES);
  // Don't let a fuzzy match steal a column already claimed as an identifier
  // or the name.
  if (
    photoColumn &&
    (photoColumn === iqamaColumn || photoColumn === idColumn || photoColumn === nameColumn)
  ) {
    photoColumn = null;
  }
  let areaColumn = findColumn(headers, AREA_ALIASES);
  if (
    areaColumn &&
    (areaColumn === iqamaColumn ||
      areaColumn === idColumn ||
      areaColumn === nameColumn ||
      areaColumn === photoColumn)
  ) {
    areaColumn = null;
  }
  return { headers, rows, iqamaColumn, idColumn, nameColumn, photoColumn, areaColumn };
}
