import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useIsFetching } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

// A brief wait shouldn't flash an indicator; only show it once the page has
// actually been busy for a moment.
const SHOW_DELAY_MS = 150;

// Global "something is loading" cue: a slim bar across the top plus a small
// spinner pill. It's busy while the router is switching pages OR while a
// query that has nothing cached yet is fetching — i.e. exactly the moments
// the user is staring at an empty page. Background refetches of data that's
// already on screen don't trigger it.
export function NavigationProgress() {
  const { t } = useLanguage();
  const routing = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const firstLoads = useIsFetching({ predicate: (q) => q.state.data === undefined });
  const busy = routing || firstLoads > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!visible) return null;

  return (
    <>
      <div
        role="progressbar"
        aria-label={t("nav.loading")}
        className="pointer-events-none fixed inset-x-0 top-0 z-60 h-1 overflow-hidden bg-primary/15"
      >
        <div className="animate-nav-progress h-full w-1/3 rounded-full bg-primary" />
      </div>
      <div className="animate-in fade-in pointer-events-none fixed bottom-4 left-1/2 z-60 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        {t("nav.loading")}
      </div>
    </>
  );
}
