// Shared between the documents admin page and (later) any other place that
// needs to know a rider document's type or expiry state.

export const DOC_TYPES = [
  "iqama_photo",
  "driving_license",
  "operating_card",
  "vehicle_registration",
  "operating_card_extra",
  "operating_card_extra_form",
  "ajeer_contract",
  "driver_card",
  "health_certificate",
  "personal_photo",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

// These are never time-limited, so unlike every other slot they carry no
// expiry date at all — no status badge countdown, no "edit date" action.
export const NO_EXPIRY_DOC_TYPES = new Set<string>([
  "personal_photo",
  "vehicle_registration",
  "operating_card_extra_form",
]);

// A custom (admin-named) document has no shared type key — each one is its
// own fresh "custom:<uuid>", so whether IT needs an expiry date can't come
// from a static list the way the 7 fixed slots do. It's chosen once, at
// creation, and remembered on the row as `needs_expiry` — passed in here as
// `customNeedsExpiry` by every caller that already has that row loaded.
// Omitting it (every pre-existing call site) keeps the old, unconditional
// "every custom doc needs an expiry" behavior exactly as it was.
export function docTypeNeedsExpiry(docType: string, customNeedsExpiry?: boolean | null): boolean {
  if (NO_EXPIRY_DOC_TYPES.has(docType)) return false;
  if (isCustomDocType(docType) && customNeedsExpiry != null) return customNeedsExpiry;
  return true;
}

// Both slots follow the same card-sharing rule (max 3 riders per card
// number, all in the same area) — each tracked independently, so the same
// card number can be reused across the two slots without colliding.
export const OPERATING_CARD_TYPES = new Set<string>(["operating_card", "operating_card_extra"]);

// A custom document is also treated as an operating card the moment its
// name starts with "كرت تشغيل" — e.g. "كرت تشغيل لجاهز" — so a company can
// define its own extra card slots (one per delivery provider, say) without
// code changes, and they immediately get the same max-3/same-area rule as
// the two fixed card slots. Matched on the admin-typed label, since a
// custom doc_type is a one-off UUID with no shared meaning across riders —
// the label is the only thing that can group "the same card family"
// together.
export const OPERATING_CARD_LABEL_PREFIX = "كرت تشغيل";

export function looksLikeOperatingCardLabel(label: string | null | undefined): boolean {
  return !!label && label.trim().startsWith(OPERATING_CARD_LABEL_PREFIX);
}

export function isOperatingCardDocType(docType: string, label?: string | null): boolean {
  return OPERATING_CARD_TYPES.has(docType) || looksLikeOperatingCardLabel(label);
}

// Every operating card number follows the same shape as printed on the
// card: two digits, a dash, eight digits — e.g. 38-00000000. Never more or
// fewer than 11 characters total.
export const OPERATING_CARD_NUMBER_FORMAT = "38-00000000";
const OPERATING_CARD_NUMBER_RE = /^\d{2}-\d{8}$/;

export function isValidOperatingCardNumber(cardNumber: string): boolean {
  return OPERATING_CARD_NUMBER_RE.test(cardNumber.trim());
}

// Beyond the 7 required slots, a company can attach extra admin-named
// documents to a rider. Each one gets a fresh "custom:<uuid>" doc_type so it
// never collides with the fixed slots or with another custom document.
const CUSTOM_DOC_TYPE_RE = /^custom:[0-9a-f-]{36}$/i;

export function isKnownDocType(docType: string): docType is DocType {
  return (DOC_TYPES as readonly string[]).includes(docType);
}

export function isCustomDocType(docType: string): boolean {
  return CUSTOM_DOC_TYPE_RE.test(docType);
}

export function newCustomDocType(): string {
  return `custom:${crypto.randomUUID()}`;
}

export type DocStatus = "ok" | "warning" | "expired" | "missing";

// More than 30 days left = ok, 1-30 days = warning, 0 or past = expired.
// Computed purely from the stored expiry_date, never persisted, so it's
// always correct with no background job.
export function computeDocStatus(expiryDate: string | null | undefined): {
  status: DocStatus;
  daysLeft: number | null;
} {
  if (!expiryDate) return { status: "missing", daysLeft: null };
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiryDate);
  if (!parts) return { status: "missing", daysLeft: null };
  const expiryDays = Math.floor(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) / 86_400_000,
  );
  const now = new Date();
  const todayDays = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  const daysLeft = expiryDays - todayDays;
  if (daysLeft <= 0) return { status: "expired", daysLeft };
  if (daysLeft <= 30) return { status: "warning", daysLeft };
  return { status: "ok", daysLeft };
}

// Guards against a mistyped year (e.g. typing "27" and having it land as
// 0027 instead of 2027) — format, calendar validity, and a sane year range
// are all checked, so an obviously wrong date is rejected with a clear error
// instead of being silently accepted.
const MIN_EXPIRY_YEAR = 2000;
const MAX_EXPIRY_YEAR_OFFSET = 30;

export function isValidExpiryDate(dateStr: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < MIN_EXPIRY_YEAR || year > new Date().getFullYear() + MAX_EXPIRY_YEAR_OFFSET) {
    return false;
  }
  if (month < 1 || month > 12) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// Best-effort normalizer for a date cell coming out of an uploaded sheet —
// Excel/Sheets can display a date in any of these shapes depending on the
// file's own formatting, but every date field in this app stores and
// validates "yyyy-mm-dd" only. Day-first (not month-first) when the slashed
// form is ambiguous, matching the DMY date inputs used everywhere else in
// this app. Returns null rather than guessing when the shape isn't
// recognized, so the caller can reject that row with a clear message
// instead of silently storing a wrong date.
export function normalizeSheetDateToIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export const ALLOWED_DOC_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];

export function hasAllowedDocExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
