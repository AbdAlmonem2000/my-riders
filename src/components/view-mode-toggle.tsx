import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import type { ViewMode } from "@/lib/use-view-mode";

// The small square-icon switch that lets an admin pick between a card grid
// and a table for the same list — shared so every page offering both looks
// and behaves identically.
export function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-1 rounded-lg border p-1">
      <Button
        type="button"
        size="sm"
        variant={mode === "cards" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        title={t("common.viewModeCards")}
        onClick={() => onChange("cards")}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "table" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        title={t("common.viewModeTable")}
        onClick={() => onChange("table")}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
