// Picks a "performance" number out of an arbitrary report row. Company
// sheets have no fixed schema, so this is a best-effort heuristic: look for
// a column whose name contains one of a metric's known keywords (Arabic or
// English) and whose value is numeric. Shared between the rider's own
// report page and the admin performance dashboard so both agree on what
// counts as "the" total/hours/salary column.

export function isNumericLike(v: unknown): v is number {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return true;
  return false;
}

export const HIGHLIGHT_KEYS = {
  total: ["total", "orders", "الطلبات", "إجمالي", "اجمالي", "deliveries", "التوصيلات"],
  hours: ["hour", "ساعات", "ساعة"],
  salary: ["net", "salary", "راتب", "صافي", "المستحق"],
};

export function pickMetric(
  data: Record<string, unknown>,
  keys: string[],
): { label: string; value: unknown } | null {
  const lower = Object.keys(data).map((k) => [k, k.toLowerCase()] as const);
  for (const key of keys) {
    const hit = lower.find(([, l]) => l.includes(key.toLowerCase()));
    if (hit && isNumericLike(data[hit[0]])) {
      return { label: hit[0], value: data[hit[0]] };
    }
  }
  return null;
}

// Best-effort numeric coercion for a metric value picked above — handles the
// formatted-string cells the sheet parser produces (raw: false).
export function metricNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
