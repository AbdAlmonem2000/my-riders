import { Badge } from "@/components/ui/badge";
import type { DocStatus } from "@/lib/document-status";
import type { TranslationKey } from "@/lib/i18n";

// Shared between the rider-documents and company-documents admin pages —
// both use the same ok/warning/expired/missing model.
export function StatusBadge({
  status,
  daysLeft,
  t,
}: {
  status: DocStatus;
  daysLeft: number | null;
  t: (key: TranslationKey) => string;
}) {
  if (status === "missing") {
    return (
      <Badge variant="outline" className="shrink-0 text-muted-foreground">
        {t("documents.statusMissing")}
      </Badge>
    );
  }
  if (status === "ok") {
    return (
      <Badge className="shrink-0 border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        {t("documents.statusOk")}
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge className="shrink-0 border-transparent bg-amber-100 text-amber-700 hover:bg-amber-100">
        {t("documents.statusWarning")} · {daysLeft} {t("documents.daysLeftSuffix")}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="shrink-0">
      {t("documents.statusExpired")}
    </Badge>
  );
}
