import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TranslationKey } from "@/lib/i18n";

// Multi-select area filter, shared by every admin page that lets you narrow
// a list down by area (Documents, Riders, Operating Cards). An empty
// selection means "no filter" (every area shown) — the same convention
// AreasPicker on the staff-permissions page uses for allowedAreas === null,
// just with a Set here since there's no "all" sentinel value to store.
export function AreaFilterPicker({
  areas,
  selected,
  onChange,
  t,
}: {
  areas: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (area: string) => {
    const next = new Set(selected);
    if (next.has(area)) next.delete(area);
    else next.add(area);
    onChange(next);
  };

  const label =
    selected.size === 0
      ? t("admin.filterAllAreas")
      : selected.size === 1
        ? [...selected][0]
        : t("admin.filterAreasCount").replace("{count}", String(selected.size));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between sm:w-52"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
          <Checkbox checked={selected.size === 0} onCheckedChange={() => onChange(new Set())} />
          {t("admin.filterAllAreas")}
        </label>
        <div className="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
          {areas.map((a) => (
            <label
              key={a}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={selected.has(a)} onCheckedChange={() => toggle(a)} />
              <span className="truncate">{a}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
