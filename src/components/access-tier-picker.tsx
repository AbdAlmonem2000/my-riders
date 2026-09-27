import { Button } from "@/components/ui/button";
import type { TranslationKey } from "@/lib/i18n";

// Shared between the staff (per-user) and company (per-plan) permission
// UIs — both gate the same five pages with the same tier shapes, just at
// different scopes (see src/routes/_authenticated/admin/users.tsx and
// super-admin/index.tsx).
export type TieredAccess = "none" | "view" | "full";
export type DocumentsAccess = "none" | "view_only" | "full";

export function tierLabel(
  tier: TieredAccess,
  fullKey: TranslationKey,
  t: (key: TranslationKey) => string,
) {
  if (tier === "none") return t("users.accessNoneLabel");
  if (tier === "view") return t("users.accessViewLabel");
  return t(fullKey);
}

export function TierPicker({
  value,
  fullLabelKey,
  onChange,
  t,
}: {
  value: TieredAccess;
  fullLabelKey: TranslationKey;
  onChange: (v: TieredAccess) => void;
  t: (key: TranslationKey) => string;
}) {
  const options: { value: TieredAccess; label: string }[] = [
    { value: "none", label: t("users.accessNoneLabel") },
    { value: "view", label: t("users.accessViewLabel") },
    { value: "full", label: t(fullLabelKey) },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function DocumentsAccessPicker({
  value,
  onChange,
  t,
}: {
  value: DocumentsAccess;
  onChange: (v: DocumentsAccess) => void;
  t: (key: TranslationKey) => string;
}) {
  const options: { value: DocumentsAccess; label: string }[] = [
    { value: "none", label: t("users.accessNoneLabel") },
    { value: "view_only", label: t("users.documentsAccessViewOnly") },
    { value: "full", label: t("users.documentsAccessFull") },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
