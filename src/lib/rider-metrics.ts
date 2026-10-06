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

// Specific keywords ("deliveries"/"orders") come before the generic
// "total"/"إجمالي" ones — a column like "total_verification_requests" also
// contains "total", so if the generic keyword were checked first it could
// win over the actual deliveries/orders column it sits next to.
export const HIGHLIGHT_KEYS = {
  total: ["deliveries", "orders", "التوصيلات", "الطلبات", "total", "إجمالي", "اجمالي"],
  hours: ["hour", "ساعات", "ساعة"],
  salary: ["net", "salary", "راتب", "صافي", "المستحق"],
};

// Never picked as a metric match even when a keyword also matches —
// "total_verification_requests"/"successful_verification_requests" contain
// "total" but aren't a deliveries/orders total at all.
const EXCLUDED_METRIC_SUBSTRINGS = ["verification"];

export function pickMetric(
  data: Record<string, unknown>,
  keys: string[],
): { label: string; value: unknown } | null {
  const lower = Object.keys(data)
    .map((k) => [k, k.toLowerCase()] as const)
    .filter(([, l]) => !EXCLUDED_METRIC_SUBSTRINGS.some((x) => l.includes(x)));
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
