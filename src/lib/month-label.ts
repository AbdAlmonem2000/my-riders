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
