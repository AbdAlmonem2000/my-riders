// Sidebar link styling shared by the admin and super-admin layouts. The
// active state is deliberately loud — a solid fill, a shadow and a small
// nudge towards the page content — so it's obvious which page you're on.
export const NAV_LINK_CLASS =
  "relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-[0.97]";

export const NAV_LINK_ACTIVE_CLASS =
  "!bg-primary !text-primary-foreground shadow-md md:ltr:translate-x-1 md:rtl:-translate-x-1";
