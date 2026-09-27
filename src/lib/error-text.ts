// Surface *something* useful whatever shape the failure arrives in — a plain
// Error, a serverFn wrapper, a swallowed gateway 500, an abort/timeout.
export function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}
