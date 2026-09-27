import { useState } from "react";

export type ViewMode = "cards" | "table";

function readStoredViewMode(storageKey: string, defaultMode: ViewMode): ViewMode {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "cards" || stored === "table" ? stored : defaultMode;
  } catch {
    return defaultMode;
  }
}

// Which layout a list-heavy admin page (riders, documents, …) should render
// in — shared so every page that offers both a card grid and a table keeps
// its own remembered choice, under its own storage key, the way the admin
// sidebar's open/closed state persists.
export function useViewMode(storageKey: string, defaultMode: ViewMode = "cards") {
  const [mode, setModeState] = useState<ViewMode>(() =>
    readStoredViewMode(storageKey, defaultMode),
  );
  const setMode = (next: ViewMode) => {
    setModeState(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* private browsing — not persisted, still switches for this visit */
    }
  };
  return [mode, setMode] as const;
}
