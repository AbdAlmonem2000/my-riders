// A single day/month/year format used everywhere a date is shown, instead
// of each page picking its own locale (which made some dates render in
// Arabic-Hijri-ish digits/order depending on the browser). Always numeric,
// always day/month/year, regardless of the UI language.
export function formatDate(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(d)} ${time}`;
}
