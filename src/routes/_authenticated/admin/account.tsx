import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, KeyRound, Loader2, Mail, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { checkIsAdmin } from "@/lib/reports.functions";
import { errText } from "@/lib/error-text";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/account")({
  component: AdminAccount,
});

function SectionLabel({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
    </div>
  );
}

// Self-service name change — the display name a company admin gave this
// staff account at creation, editable here through the same
// update_my_display_name RPC any signed-in user can call on their own row.
function NameSection({
  currentName,
  t,
}: {
  currentName: string | null;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(currentName ?? "");
  }, [currentName]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error(t("account.toastNameRequired"));
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_my_display_name", { _name: name.trim() });
      if (error) throw new Error(error.message);
      toast.success(t("account.toastNameSaved"));
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      toast.error(errText(err, t("account.toastNameFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <SectionLabel icon={User}>{t("account.nameLabel")}</SectionLabel>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("account.namePlaceholder")}
          maxLength={120}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
        </Button>
      </form>
    </div>
  );
}

// Personal override for the "document about to expire" alert bell's lead
// time — leaving it blank falls back to the company's own default (set on
// the company profile page), same self-service RPC pattern as the name
// above (the row is theirs, so no company/role check is needed).
function ExpiryNotifyDaysSection({
  personalDays,
  companyDays,
  t,
}: {
  personalDays: number | null;
  companyDays: number;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(personalDays !== null ? String(personalDays) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDays(personalDays !== null ? String(personalDays) : "");
  }, [personalDays]);

  const save = async (value: number | null) => {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 365)) {
      return toast.error(t("account.toastExpiryNotifyDaysInvalid"));
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_my_expiry_notify_days", { _days: value });
      if (error) throw new Error(error.message);
      toast.success(t("admin.save"));
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      toast.error(errText(err, t("account.toastExpiryNotifyDaysFailed")));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save(days.trim() ? Number(days) : null);
  };

  return (
    <div className="space-y-1.5">
      <SectionLabel icon={BellRing}>{t("account.expiryNotifyDaysLabel")}</SectionLabel>
      <p className="text-xs text-muted-foreground">
        {t("account.expiryNotifyDaysDesc")} ({t("account.expiryNotifyDaysCompanyDefault")}:{" "}
        {companyDays})
      </p>
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder={String(companyDays)}
          className="w-28"
        />
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
        </Button>
        {personalDays !== null && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => save(null)}
          >
            {t("account.expiryNotifyDaysResetButton")}
          </Button>
        )}
      </form>
    </div>
  );
}

// Self-service password change — any authenticated user can change their
// own password this way, regardless of role or permissions, since it goes
// through Supabase Auth directly rather than any company-scoped RPC.
function PasswordSection({ t }: { t: (key: TranslationKey) => string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error(t("companyProfile.toastPasswordTooShort"));
    if (password !== confirm) return toast.error(t("companyProfile.toastPasswordMismatch"));
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      toast.success(t("companyProfile.toastPasswordChanged"));
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastPasswordFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <SectionLabel icon={KeyRound}>{t("companyProfile.passwordTitle")}</SectionLabel>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("companyProfile.newPasswordPlaceholder")}
          dir="ltr"
        />
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("companyProfile.confirmPasswordPlaceholder")}
          dir="ltr"
        />
        <Button type="submit" size="sm" disabled={saving || !password || !confirm}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
        </Button>
      </form>
    </div>
  );
}

function AdminAccount() {
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });

  const userQuery = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const d = adminCheck.data;
  const permissionBadges: { key: TranslationKey; tierKey: TranslationKey }[] = [];
  if (d) {
    if (d.overviewAccess) {
      permissionBadges.push({ key: "admin.navOverview", tierKey: "users.accessViewLabel" });
    }
    if (d.ridersAccess !== "none") {
      permissionBadges.push({
        key: "admin.navRiders",
        tierKey:
          d.ridersAccess === "full" ? "users.ridersAccessFullLabel" : "users.accessViewLabel",
      });
    }
    if (d.reportsAccess !== "none") {
      permissionBadges.push({
        key: "admin.navReports",
        tierKey:
          d.reportsAccess === "full" ? "users.reportsAccessFullLabel" : "users.accessViewLabel",
      });
    }
    if (d.documentsAccess !== "none") {
      permissionBadges.push({
        key: "admin.navDocuments",
        tierKey:
          d.documentsAccess === "full"
            ? "users.documentsAccessFull"
            : "users.documentsAccessViewOnly",
      });
    }
    if (d.lettersAccess !== "none") {
      permissionBadges.push({
        key: "admin.navLetters",
        tierKey:
          d.lettersAccess === "full" ? "users.lettersAccessFullLabel" : "users.accessViewLabel",
      });
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <Card>
        <CardHeader>
          <CardTitle>{t("account.pageTitle")}</CardTitle>
          <CardDescription>{t("account.pageDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 divide-y">
          <div className="space-y-1.5">
            <SectionLabel icon={Mail}>{t("account.emailLabel")}</SectionLabel>
            <p className="text-sm text-muted-foreground" dir="ltr">
              {userQuery.data?.email ?? "—"}
            </p>
          </div>

          {d?.isStaff && (
            <div className="pt-4">
              <NameSection currentName={d.displayName} t={t} />
            </div>
          )}

          {d && d.documentsAccess !== "none" && (
            <div className="pt-4">
              <ExpiryNotifyDaysSection
                personalDays={d.personalExpiryNotifyDays}
                companyDays={d.companyExpiryNotifyDays}
                t={t}
              />
            </div>
          )}

          <div className="space-y-2 pt-4">
            <SectionLabel icon={ShieldCheck}>{t("account.permissionsLabel")}</SectionLabel>
            {d?.isStaff ? (
              permissionBadges.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("account.noPermissions")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {permissionBadges.map((b) => (
                      <Badge key={b.key} variant="secondary" className="text-[10px]">
                        {t(b.key)}: {t(b.tierKey)}
                      </Badge>
                    ))}
                    {d.canDeleteRiders && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("users.ridersDeleteAccessLabel")}
                      </Badge>
                    )}
                    {d.canBlockRiders && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("users.ridersBlockAccessLabel")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("users.areasLabel")}:{" "}
                    {d.allowedAreas === null
                      ? t("users.allAreasBadge")
                      : d.allowedAreas.length > 0
                        ? d.allowedAreas.join("، ")
                        : "—"}
                  </p>
                </>
              )
            ) : (
              <p className="text-xs text-muted-foreground">{t("account.adminFullAccess")}</p>
            )}
          </div>

          <div className="pt-4">
            <PasswordSection t={t} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
