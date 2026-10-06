// Kept separate from excel.ts (which pulls in the ~480KB xlsx library) so
// pages that only need a month's display name — the public rider lookup
// page, the admin dashboard — don't pay for parsing Excel files they never
// touch.
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

// A report now belongs to one specific day (e.g. "1 أكتوبر 2026") rather
// than a whole month — `day` is null only for a report uploaded before this
// existed, which genuinely represents the whole month, so it keeps showing
// the plain month label instead of claiming a day it doesn't have.
export function reportDateLabel(
  day: number | null | undefined,
  month: number,
  year: number,
  lang: "ar" | "en" = "ar",
) {
  const month_ = monthLabel(month, year, lang);
  return day ? `${day} ${month_}` : month_;
}
