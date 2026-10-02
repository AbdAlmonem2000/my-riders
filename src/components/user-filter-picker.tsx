import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listCompanyStaff } from "@/lib/company-staff.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TranslationKey } from "@/lib/i18n";

// A shortcut for the area filter next to it: pick a staff member and their
// own allowed_areas becomes the area selection, instead of picking each
// area by hand — e.g. staff member Mohamed is scoped to Jubail + Dammam, so
// picking "Mohamed" here shows exactly the riders/cards he can see.
// Admin-only (listCompanyStaff itself is admin-gated), so the caller should
// only render this for a real company admin, not a staff account.
export function UserFilterPicker({
  onPickAreas,
  t,
}: {
  onPickAreas: (areas: string[] | null) => void;
  t: (key: TranslationKey) => string;
}) {
  const listFn = useServerFn(listCompanyStaff);
  const staffQuery = useQuery({
    queryKey: ["company-staff"],
    queryFn: () => listFn(),
  });
  const [value, setValue] = useState<string>("");

  if (!staffQuery.data || staffQuery.data.length === 0) return null;

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(v);
        if (v === "__none__") {
          onPickAreas(null);
          return;
        }
        const staff = staffQuery.data?.find((s) => s.id === v);
        onPickAreas(staff?.allowedAreas ?? null);
      }}
    >
      <SelectTrigger className="sm:w-52">
        <SelectValue placeholder={t("admin.filterByUserPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{t("admin.filterByUserNone")}</SelectItem>
        {staffQuery.data.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.displayName || s.email || "—"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
