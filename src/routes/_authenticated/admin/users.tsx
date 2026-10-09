import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  KeyRound,
  Loader2,
  Mail,
  MoreVertical,
  Plus,
  Settings2,
  Trash2,
  UserCog,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listCompanyStaff,
  createCompanyStaff,
  updateCompanyStaffPermissions,
  updateCompanyStaffName,
  updateCompanyStaffEmail,
  updateCompanyStaffPassword,
  deleteCompanyStaff,
} from "@/lib/company-staff.functions";
import {
  tierLabel,
  TierPicker,
  DocumentsAccessPicker,
  type TieredAccess,
  type DocumentsAccess,
} from "@/components/access-tier-picker";
import { errText } from "@/lib/error-text";
import { formatDateTime } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { fetchAllRows } from "@/lib/supabase-paginate";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsers,
});

interface Permissions {
  allowedAreas: string[] | null;
  overviewAccess: boolean;
  ridersAccess: TieredAccess;
  // Only meaningful when ridersAccess is 'full' — deleting/blocking a rider
  // is each a step up from editing one.
  ridersDeleteAccess: boolean;
  ridersBlockAccess: boolean;
  reportsAccess: TieredAccess;
  documentsAccess: DocumentsAccess;
  lettersAccess: TieredAccess;
  notificationsAccess: boolean;
  // Only meaningful when documentsAccess isn't 'none' — the Operating Cards
  // page is just another view of the same document data.
  operatingCardsAccess: boolean;
  // Only meaningful when operatingCardsAccess is true.
  operatingCardsUploadAccess: boolean;
  operatingCardsExportAccess: boolean;
  operatingCardsDeleteAccess: boolean;
  // Only meaningful when documentsAccess isn't 'none' — same reasoning as
  // operatingCardsAccess above.
  expiryAlertsAccess: boolean;
  // Only meaningful when overviewAccess is true — lets this staff member
  // change the dashboard's shared column filters for everyone in the
  // company, not just view whatever the admin already picked.
  dashboardFiltersEditAccess: boolean;
}

interface StaffRow extends Permissions {
  id: string;
  email: string | null;
  displayName: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

function AreasPicker({
  allAreas,
  onAllAreasChange,
  selectedAreas,
  onToggleArea,
  availableAreas,
  t,
}: {
  allAreas: boolean;
  onAllAreasChange: (v: boolean) => void;
  selectedAreas: string[];
  onToggleArea: (area: string) => void;
  availableAreas: string[];
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={allAreas} onCheckedChange={(v) => onAllAreasChange(!!v)} />
        {t("users.areasAllToggle")}
      </label>
      {!allAreas &&
        (availableAreas.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("users.areasNoneAvailable")}</p>
        ) : (
          <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-3">
            {availableAreas.map((area) => (
              <label key={area} className="flex cursor-pointer items-center gap-1.5 text-xs">
                <Checkbox
                  checked={selectedAreas.includes(area)}
                  onCheckedChange={() => onToggleArea(area)}
                />
                <span className="truncate">{area}</span>
              </label>
            ))}
          </div>
        ))}
    </div>
  );
}

// The full permission set, shared by the create dialog and the manage
// dialog's "permissions" tab.
function PermissionsFields({
  value,
  onChange,
  availableAreas,
  t,
}: {
  value: Permissions;
  onChange: (next: Permissions) => void;
  availableAreas: string[];
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onChange({ ...ALL_ACCESS_PERMISSIONS })}
      >
        {t("users.grantAllButton")}
      </Button>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={value.overviewAccess}
          onCheckedChange={(v) =>
            onChange({
              ...value,
              overviewAccess: !!v,
              dashboardFiltersEditAccess: v ? value.dashboardFiltersEditAccess : false,
            })
          }
        />
        {t("users.overviewAccessLabel")}
      </label>
      {value.overviewAccess && (
        <label className="flex cursor-pointer items-center gap-2 ps-6 text-sm">
          <Checkbox
            checked={value.dashboardFiltersEditAccess}
            onCheckedChange={(v) => onChange({ ...value, dashboardFiltersEditAccess: !!v })}
          />
          {t("users.dashboardFiltersEditAccessLabel")}
        </label>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("users.ridersAccessLabel")}</Label>
        <TierPicker
          value={value.ridersAccess}
          fullLabelKey="users.ridersAccessFullLabel"
          onChange={(v) =>
            onChange({
              ...value,
              ridersAccess: v,
              ridersDeleteAccess: v === "full" && value.ridersDeleteAccess,
              ridersBlockAccess: v === "full" && value.ridersBlockAccess,
            })
          }
          t={t}
        />
        {value.ridersAccess === "full" && (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={value.ridersDeleteAccess}
                onCheckedChange={(v) => onChange({ ...value, ridersDeleteAccess: !!v })}
              />
              {t("users.ridersDeleteAccessLabel")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={value.ridersBlockAccess}
                onCheckedChange={(v) => onChange({ ...value, ridersBlockAccess: !!v })}
              />
              {t("users.ridersBlockAccessLabel")}
            </label>
          </>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("users.reportsAccessLabel")}</Label>
        <TierPicker
          value={value.reportsAccess}
          fullLabelKey="users.reportsAccessFullLabel"
          onChange={(v) => onChange({ ...value, reportsAccess: v })}
          t={t}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("users.documentsAccessLabel")}</Label>
        <DocumentsAccessPicker
          value={value.documentsAccess}
          onChange={(v) =>
            onChange({
              ...value,
              documentsAccess: v,
              operatingCardsAccess: v !== "none" && value.operatingCardsAccess,
              operatingCardsUploadAccess: v !== "none" && value.operatingCardsUploadAccess,
              operatingCardsExportAccess: v !== "none" && value.operatingCardsExportAccess,
              operatingCardsDeleteAccess: v !== "none" && value.operatingCardsDeleteAccess,
              expiryAlertsAccess: v !== "none" && value.expiryAlertsAccess,
            })
          }
          t={t}
        />
        {value.documentsAccess !== "none" && (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={value.operatingCardsAccess}
                onCheckedChange={(v) =>
                  onChange({
                    ...value,
                    operatingCardsAccess: !!v,
                    operatingCardsUploadAccess: v ? value.operatingCardsUploadAccess : false,
                    operatingCardsExportAccess: v ? value.operatingCardsExportAccess : false,
                    operatingCardsDeleteAccess: v ? value.operatingCardsDeleteAccess : false,
                  })
                }
              />
              {t("users.operatingCardsAccessLabel")}
            </label>
            {value.operatingCardsAccess && (
              <div className="ms-6 space-y-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.operatingCardsUploadAccess}
                    onCheckedChange={(v) => onChange({ ...value, operatingCardsUploadAccess: !!v })}
                  />
                  {t("users.operatingCardsUploadAccessLabel")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.operatingCardsExportAccess}
                    onCheckedChange={(v) => onChange({ ...value, operatingCardsExportAccess: !!v })}
                  />
                  {t("users.operatingCardsExportAccessLabel")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.operatingCardsDeleteAccess}
                    onCheckedChange={(v) => onChange({ ...value, operatingCardsDeleteAccess: !!v })}
                  />
                  {t("users.operatingCardsDeleteAccessLabel")}
                </label>
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={value.expiryAlertsAccess}
                onCheckedChange={(v) => onChange({ ...value, expiryAlertsAccess: !!v })}
              />
              {t("users.expiryAlertsAccessLabel")}
            </label>
          </>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("users.lettersAccessLabel")}</Label>
        <TierPicker
          value={value.lettersAccess}
          fullLabelKey="users.lettersAccessFullLabel"
          onChange={(v) => onChange({ ...value, lettersAccess: v })}
          t={t}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={value.notificationsAccess}
          onCheckedChange={(v) => onChange({ ...value, notificationsAccess: !!v })}
        />
        {t("users.notificationsAccessLabel")}
      </label>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("users.areasLabel")}</Label>
        <AreasPicker
          allAreas={value.allowedAreas === null}
          onAllAreasChange={(all) => onChange({ ...value, allowedAreas: all ? null : [] })}
          selectedAreas={value.allowedAreas ?? []}
          onToggleArea={(area) => {
            const current = value.allowedAreas ?? [];
            const next = current.includes(area)
              ? current.filter((a) => a !== area)
              : [...current, area];
            onChange({ ...value, allowedAreas: next });
          }}
          availableAreas={availableAreas}
          t={t}
        />
      </div>
    </div>
  );
}

const DEFAULT_PERMISSIONS: Permissions = {
  allowedAreas: null,
  overviewAccess: false,
  ridersAccess: "none",
  ridersDeleteAccess: false,
  ridersBlockAccess: false,
  reportsAccess: "none",
  documentsAccess: "none",
  lettersAccess: "none",
  notificationsAccess: false,
  operatingCardsAccess: false,
  operatingCardsUploadAccess: false,
  operatingCardsExportAccess: false,
  operatingCardsDeleteAccess: false,
  expiryAlertsAccess: false,
  dashboardFiltersEditAccess: false,
};

// Every page, every tier's top level, every area — the "grant all" shortcut
// so an admin doesn't have to click through each picker one at a time when
// they just want a staff member to have the run of the place.
const ALL_ACCESS_PERMISSIONS: Permissions = {
  allowedAreas: null,
  overviewAccess: true,
  ridersAccess: "full",
  ridersDeleteAccess: true,
  ridersBlockAccess: true,
  reportsAccess: "full",
  documentsAccess: "full",
  lettersAccess: "full",
  notificationsAccess: true,
  operatingCardsAccess: true,
  operatingCardsUploadAccess: true,
  operatingCardsExportAccess: true,
  operatingCardsDeleteAccess: true,
  expiryAlertsAccess: true,
  dashboardFiltersEditAccess: true,
};

function CreateStaffDialog({
  availableAreas,
  saving,
  t,
  onCreate,
}: {
  availableAreas: string[];
  saving: boolean;
  t: (key: TranslationKey) => string;
  onCreate: (
    displayName: string,
    email: string,
    password: string,
    permissions: Permissions,
  ) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);

  const reset = () => {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setPermissions(DEFAULT_PERMISSIONS);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onCreate(displayName.trim(), email.trim(), password, permissions);
    if (ok) {
      setOpen(false);
      reset();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="ms-1.5 h-4 w-4" />
          {t("users.createButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("users.createButton")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("users.nameLabel")}</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("users.namePlaceholder")}
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("users.emailLabel")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("users.passwordLabel")}</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("users.passwordPlaceholder")}
              dir="ltr"
              minLength={6}
              required
            />
          </div>
          <PermissionsFields
            value={permissions}
            onChange={setPermissions}
            availableAreas={availableAreas}
            t={t}
          />
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("users.createButton")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageStaffDialog({
  staff,
  availableAreas,
  savingUserId,
  t,
  onUpdatePermissions,
  onUpdateName,
  onUpdateEmail,
  onUpdatePassword,
  open,
  onOpenChange,
}: {
  staff: StaffRow;
  availableAreas: string[];
  savingUserId: string | null;
  t: (key: TranslationKey) => string;
  onUpdatePermissions: (userId: string, permissions: Permissions) => Promise<boolean>;
  onUpdateName: (userId: string, displayName: string) => Promise<boolean>;
  onUpdateEmail: (userId: string, email: string) => Promise<boolean>;
  onUpdatePassword: (userId: string, password: string) => Promise<boolean>;
  // Opened from the row's "⋮" menu, not its own trigger button — one
  // instance is shared across every row instead of mounting one per staff
  // member.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [permissions, setPermissions] = useState<Permissions>(staff);
  const [displayName, setDisplayName] = useState(staff.displayName ?? "");
  const [email, setEmail] = useState(staff.email ?? "");
  const [password, setPassword] = useState("");

  const saving = savingUserId === staff.id;

  const submitPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdatePermissions(staff.id, permissions);
  };

  const submitName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    const ok = await onUpdateName(staff.id, displayName.trim());
    if (!ok) setDisplayName(staff.displayName ?? "");
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    const ok = await onUpdateEmail(staff.id, email.trim());
    if (!ok) setEmail(staff.email ?? "");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return;
    const ok = await onUpdatePassword(staff.id, password);
    if (ok) setPassword("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          setPermissions(staff);
          setDisplayName(staff.displayName ?? "");
          setEmail(staff.email ?? "");
          setPassword("");
        }
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{staff.displayName || staff.email || "—"}</DialogTitle>
          <DialogDescription>{t("users.editPermissionsTooltip")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submitName} className="space-y-1.5 border-b pb-4">
          <Label className="text-xs">{t("users.nameLabel")}</Label>
          <div className="flex gap-2">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              className="flex-1"
              required
            />
            <Button type="submit" size="sm" variant="outline" disabled={saving}>
              {t("admin.save")}
            </Button>
          </div>
        </form>

        <form onSubmit={submitPermissions} className="space-y-3 border-b pb-4">
          <PermissionsFields
            value={permissions}
            onChange={setPermissions}
            availableAreas={availableAreas}
            t={t}
          />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.save")}
          </Button>
        </form>

        <form onSubmit={submitEmail} className="space-y-1.5 border-b pb-4">
          <Label className="flex items-center gap-1.5 text-xs">
            <Mail className="h-3.5 w-3.5" />
            {t("users.newEmailLabel")}
          </Label>
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="flex-1"
              required
            />
            <Button type="submit" size="sm" variant="outline" disabled={saving}>
              {t("admin.save")}
            </Button>
          </div>
        </form>

        <form onSubmit={submitPassword} className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <KeyRound className="h-3.5 w-3.5" />
            {t("users.newPasswordLabel")}
          </Label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("users.passwordPlaceholder")}
              dir="ltr"
              minLength={6}
              className="flex-1"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={saving || password.length < 6}
            >
              {t("admin.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminUsers() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const listFn = useServerFn(listCompanyStaff);
  const createFn = useServerFn(createCompanyStaff);
  const updatePermissionsFn = useServerFn(updateCompanyStaffPermissions);
  const updateNameFn = useServerFn(updateCompanyStaffName);
  const updateEmailFn = useServerFn(updateCompanyStaffEmail);
  const updatePasswordFn = useServerFn(updateCompanyStaffPassword);
  const deleteFn = useServerFn(deleteCompanyStaff);

  const staffQuery = useQuery({
    queryKey: ["company-staff"],
    queryFn: (): Promise<StaffRow[]> => listFn(),
  });

  // Distinct, non-empty rider areas this company has on record — the pool
  // an admin picks a staff member's allowed areas from.
  const areasQuery = useQuery({
    queryKey: ["company-rider-areas"],
    queryFn: () =>
      // No cap here relied purely on PostgREST's own default row limit —
      // truncation here just means missing area options in the filter, but
      // it's just as free to paginate as every other roster-sized query.
      fetchAllRows<{ area: string | null }>(({ from, to }) =>
        supabase.from("riders").select("area, id").order("id", { ascending: true }).range(from, to),
      ),
  });
  const availableAreas = useMemo(() => {
    const set = new Set<string>();
    for (const r of areasQuery.data ?? []) {
      const a = r.area?.trim();
      if (a) set.add(a);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [areasQuery.data]);

  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Row actions live in a single "⋮" dropdown — tracks which staff member's
  // dialog is open, so only one shared instance of each needs to exist.
  const [managingStaffId, setManagingStaffId] = useState<string | null>(null);
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);

  const handleCreate = async (
    displayName: string,
    email: string,
    password: string,
    permissions: Permissions,
  ) => {
    setCreating(true);
    try {
      await createFn({ data: { displayName, email, password, ...permissions } });
      toast.success(t("users.toastCreateSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-staff"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("users.toastCreateFailed")));
      return false;
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateName = async (userId: string, displayName: string) => {
    setSavingUserId(userId);
    try {
      await updateNameFn({ data: { userId, displayName } });
      toast.success(t("users.toastNameUpdateSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-staff"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("users.toastNameUpdateFailed")));
      return false;
    } finally {
      setSavingUserId(null);
    }
  };

  const handleUpdatePermissions = async (userId: string, permissions: Permissions) => {
    setSavingUserId(userId);
    try {
      await updatePermissionsFn({ data: { userId, ...permissions } });
      toast.success(t("users.toastPermissionsUpdateSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-staff"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("users.toastPermissionsUpdateFailed")));
      return false;
    } finally {
      setSavingUserId(null);
    }
  };

  const handleUpdateEmail = async (userId: string, email: string) => {
    setSavingUserId(userId);
    try {
      await updateEmailFn({ data: { userId, email } });
      toast.success(t("users.toastEmailUpdateSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-staff"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("users.toastEmailUpdateFailed")));
      return false;
    } finally {
      setSavingUserId(null);
    }
  };

  const handleUpdatePassword = async (userId: string, password: string) => {
    setSavingUserId(userId);
    try {
      await updatePasswordFn({ data: { userId, password } });
      toast.success(t("users.toastPasswordUpdateSuccess"));
      return true;
    } catch (err) {
      toast.error(errText(err, t("users.toastPasswordUpdateFailed")));
      return false;
    } finally {
      setSavingUserId(null);
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await deleteFn({ data: { userId } });
      toast.success(t("users.toastDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-staff"] });
    } catch (err) {
      toast.error(errText(err, t("users.toastDeleteFailed")));
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{t("users.pageTitle")}</CardTitle>
            <CardDescription>{t("users.pageDesc")}</CardDescription>
          </div>
          <CreateStaffDialog
            availableAreas={availableAreas}
            saving={creating}
            t={t}
            onCreate={handleCreate}
          />
        </CardHeader>
        <CardContent>
          {staffQuery.isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {staffQuery.data && staffQuery.data.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <UserCog className="h-8 w-8" />
              {t("users.emptyState")}
            </div>
          )}
          {staffQuery.data && staffQuery.data.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[30rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-35">{t("users.tableName")}</TableHead>
                      <TableHead className="min-w-[180px]">{t("users.tableEmail")}</TableHead>
                      <TableHead className="min-w-55">{t("users.tablePages")}</TableHead>
                      <TableHead className="min-w-[160px]">{t("users.tableAreas")}</TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("users.tableLastSignIn")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-end">
                        {t("users.tableActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffQuery.data.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm font-medium">
                          {s.displayName || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{s.email || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {s.overviewAccess && (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("admin.navOverview")}
                                {s.dashboardFiltersEditAccess &&
                                  ` + ${t("users.dashboardFiltersEditAccessLabel")}`}
                              </Badge>
                            )}
                            {s.notificationsAccess && (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("admin.navNotifications")}
                              </Badge>
                            )}
                            {s.ridersAccess !== "none" && (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("admin.navRiders")}:{" "}
                                {tierLabel(s.ridersAccess, "users.ridersAccessFullLabel", t)}
                                {s.ridersDeleteAccess && ` + ${t("users.ridersDeleteAccessLabel")}`}
                                {s.ridersBlockAccess && ` + ${t("users.ridersBlockAccessLabel")}`}
                              </Badge>
                            )}
                            {s.reportsAccess !== "none" && (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("admin.navReports")}:{" "}
                                {tierLabel(s.reportsAccess, "users.reportsAccessFullLabel", t)}
                              </Badge>
                            )}
                            {s.documentsAccess !== "none" && (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("admin.navDocuments")}:{" "}
                                {s.documentsAccess === "full"
                                  ? t("users.documentsAccessFull")
                                  : t("users.documentsAccessViewOnly")}
                                {s.operatingCardsAccess && (
                                  <>
                                    {` + ${t("users.operatingCardsAccessLabel")}`}
                                    {s.operatingCardsUploadAccess &&
                                      ` + ${t("users.operatingCardsUploadAccessLabel")}`}
                                    {s.operatingCardsExportAccess &&
                                      ` + ${t("users.operatingCardsExportAccessLabel")}`}
                                    {s.operatingCardsDeleteAccess &&
                                      ` + ${t("users.operatingCardsDeleteAccessLabel")}`}
                                  </>
                                )}
                                {s.expiryAlertsAccess && ` + ${t("users.expiryAlertsAccessLabel")}`}
                              </Badge>
                            )}
                            {s.lettersAccess !== "none" && (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("admin.navLetters")}:{" "}
                                {tierLabel(s.lettersAccess, "users.lettersAccessFullLabel", t)}
                              </Badge>
                            )}
                            {!s.overviewAccess &&
                              !s.notificationsAccess &&
                              s.ridersAccess === "none" &&
                              s.reportsAccess === "none" &&
                              s.documentsAccess === "none" &&
                              s.lettersAccess === "none" && (
                                <span className="text-xs text-muted-foreground">
                                  {t("users.accessNoneLabel")}
                                </span>
                              )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.allowedAreas === null ? (
                            <span className="text-xs text-muted-foreground">
                              {t("users.allAreasBadge")}
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {s.allowedAreas.map((a) => (
                                <Badge key={a} variant="outline" className="text-[10px]">
                                  {a}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {s.lastSignInAt
                            ? formatDateTime(s.lastSignInAt)
                            : t("users.neverSignedIn")}
                        </TableCell>
                        <TableCell className="text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" size="sm" variant="ghost">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setManagingStaffId(s.id)}>
                                <Settings2 className="h-3.5 w-3.5" />
                                {t("users.editPermissionsTooltip")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeletingStaffId(s.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t("users.deleteTooltip")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {managingStaffId &&
        (() => {
          const staff = staffQuery.data?.find((x) => x.id === managingStaffId);
          return (
            staff && (
              <ManageStaffDialog
                staff={staff}
                availableAreas={availableAreas}
                savingUserId={savingUserId}
                t={t}
                onUpdatePermissions={handleUpdatePermissions}
                onUpdateName={handleUpdateName}
                onUpdateEmail={handleUpdateEmail}
                onUpdatePassword={handleUpdatePassword}
                open
                onOpenChange={(v) => !v && setManagingStaffId(null)}
              />
            )
          );
        })()}
      <AlertDialog open={!!deletingStaffId} onOpenChange={(v) => !v && setDeletingStaffId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("users.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingStaffId) handleDelete(deletingStaffId);
                setDeletingStaffId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("admin.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
