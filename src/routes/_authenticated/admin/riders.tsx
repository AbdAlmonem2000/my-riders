import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RiderPhoto } from "@/components/rider-photo";
import { ViewModeToggle } from "@/components/view-mode-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  uploadRoster,
  deleteRoster,
  getRosterDownloadUrl,
  setRiderBlocked,
  bulkSetRidersBlocked,
  setRiderPassword,
  createRider,
  updateRider,
  deleteRider,
  bulkDeleteRiders,
  getRiderReportCount,
  getRidersReportCount,
} from "@/lib/riders.functions";
import { checkIsAdmin } from "@/lib/reports.functions";
import { errText } from "@/lib/error-text";
import { formatDateTime } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { useViewMode } from "@/lib/use-view-mode";

export const Route = createFileRoute("/_authenticated/admin/riders")({
  component: AdminRiders,
});

function riderExtra(extra: unknown): Record<string, unknown> {
  return extra && typeof extra === "object" && !Array.isArray(extra)
    ? (extra as Record<string, unknown>)
    : {};
}

function RiderPasswordAdminDialog({
  riderId,
  riderName,
  hasPassword,
  saving,
  t,
  onSubmit,
}: {
  riderId: string;
  riderName: string | null;
  hasPassword: boolean;
  saving: boolean;
  t: (key: TranslationKey) => string;
  onSubmit: (riderId: string, password: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onSubmit(riderId, pw.trim());
    if (ok) {
      setOpen(false);
      setPw("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPw("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("admin.riderPasswordTitle")}
          className={hasPassword ? "text-primary" : "text-muted-foreground"}
        >
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("admin.riderPasswordTitle")}
            {riderName ? ` — ${riderName}` : ""}
          </DialogTitle>
          <DialogDescription>{t("admin.riderPasswordDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t("admin.riderPasswordPlaceholder")}
              dir="ltr"
              className="pl-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              tabIndex={-1}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Asks how many report rows still reference this rider, then offers the
// right choice: a rider nobody uploaded reports for can just be removed
// (nothing else to decide), while one with report history needs the admin
// to say explicitly whether those old reports should go with them or stay.
function DeleteRiderDialog({
  riderId,
  riderName,
  t,
  onDelete,
}: {
  riderId: string;
  riderName: string | null;
  t: (key: TranslationKey) => string;
  onDelete: (riderId: string, deleteReports: boolean) => Promise<boolean>;
}) {
  const getCountFn = useServerFn(getRiderReportCount);
  const [open, setOpen] = useState(false);
  const [reportCount, setReportCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCount = async () => {
    setLoadingCount(true);
    try {
      const { count } = await getCountFn({ data: { riderId } });
      setReportCount(count);
    } catch {
      // Unknown either way — offer both choices rather than blocking the
      // dialog on a failed count.
      setReportCount(null);
    } finally {
      setLoadingCount(false);
    }
  };

  const submit = async (deleteReports: boolean) => {
    setDeleting(true);
    try {
      const ok = await onDelete(riderId, deleteReports);
      if (ok) setOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setReportCount(null);
          loadCount();
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("admin.deleteRiderTooltip")}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("admin.deleteRiderTitle")}
            {riderName ? ` — ${riderName}` : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {loadingCount ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("admin.deleteRiderCheckingReports")}
              </span>
            ) : reportCount && reportCount > 0 ? (
              t("admin.deleteRiderHasReports").replace("{count}", String(reportCount))
            ) : (
              t("admin.deleteRiderNoReports")
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Stacked full-width buttons, not the default side-by-side row —
            these labels are long, and the riskiest choice (deletes reports
            too) sits last so it isn't the easiest one to hit by mistake. */}
        {!loadingCount && (
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogCancel disabled={deleting} className="w-full">
              {t("admin.cancel")}
            </AlertDialogCancel>
            {reportCount && reportCount > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting}
                  className="w-full"
                  onClick={() => submit(false)}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("admin.deleteRiderKeepReportsButton")
                  )}
                </Button>
                <AlertDialogAction
                  className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                  onClick={() => submit(true)}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("admin.deleteRiderWithReportsButton")
                  )}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={() => submit(true)}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.delete")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Same idea as DeleteRiderDialog, but for a whole selection from the bulk
// toolbar: checks the total report count across every selected rider before
// asking whether to take their reports with them or leave those alone.
function BulkDeleteRidersDialog({
  riderIds,
  t,
  onDelete,
}: {
  riderIds: string[];
  t: (key: TranslationKey) => string;
  onDelete: (riderIds: string[], deleteReports: boolean) => Promise<boolean>;
}) {
  const getCountFn = useServerFn(getRidersReportCount);
  const [open, setOpen] = useState(false);
  const [reportCount, setReportCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCount = async () => {
    setLoadingCount(true);
    try {
      const { count } = await getCountFn({ data: { riderIds } });
      setReportCount(count);
    } catch {
      setReportCount(null);
    } finally {
      setLoadingCount(false);
    }
  };

  const submit = async (deleteReports: boolean) => {
    setDeleting(true);
    try {
      const ok = await onDelete(riderIds, deleteReports);
      if (ok) setOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setReportCount(null);
          loadCount();
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="ms-1.5 h-4 w-4" />
          {t("admin.bulkDeleteTooltip")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("admin.bulkDeleteTitle").replace("{count}", String(riderIds.length))}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {loadingCount ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("admin.bulkDeleteCheckingReports")}
              </span>
            ) : reportCount && reportCount > 0 ? (
              t("admin.bulkDeleteHasReports").replace("{count}", String(reportCount))
            ) : (
              t("admin.bulkDeleteNoReports")
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!loadingCount && (
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogCancel disabled={deleting} className="w-full">
              {t("admin.cancel")}
            </AlertDialogCancel>
            {reportCount && reportCount > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting}
                  className="w-full"
                  onClick={() => submit(false)}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("admin.bulkDeleteKeepReportsButton")
                  )}
                </Button>
                <AlertDialogAction
                  className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                  onClick={() => submit(true)}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("admin.bulkDeleteWithReportsButton")
                  )}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={() => submit(true)}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.delete")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface RiderFormValues {
  iqamaNumber: string | null;
  idNumber: string | null;
  riderName: string | null;
  photoUrl: string | null;
  area: string | null;
  extra: Record<string, string>;
}

interface ExtraRow {
  key: string;
  value: string;
}

function RiderFormDialog({
  mode,
  rider,
  saving,
  t,
  onSubmit,
}: {
  mode: "create" | "edit";
  rider?: {
    id?: string;
    iqama_number: string | null;
    id_number: string | null;
    rider_name: string | null;
    photo_url: string | null;
    area?: string | null;
    extra: unknown;
  };
  saving: boolean;
  t: (key: TranslationKey) => string;
  onSubmit: (values: RiderFormValues) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [iqama, setIqama] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const [area, setArea] = useState("");
  const [extraRows, setExtraRows] = useState<ExtraRow[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);

  const resetFromRider = () => {
    setIqama(rider?.iqama_number ?? "");
    setIdNumber(rider?.id_number ?? "");
    setName(rider?.rider_name ?? "");
    setPhoto(rider?.photo_url ?? "");
    setArea(rider?.area ?? "");
    const extra = riderExtra(rider?.extra);
    setExtraRows(Object.entries(extra).map(([key, value]) => ({ key, value: String(value) })));
  };

  // Uploads straight to our own storage instead of requiring an external
  // link — the resulting public URL just replaces whatever was in the photo
  // field, same as pasting a link there by hand.
  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (photoFileRef.current) photoFileRef.current.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";
      const path = `${rider?.id ?? `new-${Date.now()}`}-${Date.now()}${ext}`;
      const { error: upErr } = await supabase.storage
        .from("rider-photos")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from("rider-photos").getPublicUrl(path);
      setPhoto(data.publicUrl);
    } catch (err) {
      toast.error(errText(err, t("admin.toastPhotoUploadFailed")));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!iqama.trim() && !idNumber.trim()) {
      return toast.error(t("admin.riderFormNeedIdentifier"));
    }
    const extra = Object.fromEntries(
      extraRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
    );
    const ok = await onSubmit({
      iqamaNumber: iqama.trim() || null,
      idNumber: idNumber.trim() || null,
      riderName: name.trim() || null,
      photoUrl: photo.trim() || null,
      area: area.trim() || null,
      extra,
    });
    if (ok) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) resetFromRider();
      }}
    >
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm" className="transition-transform active:scale-[0.98]">
            <UserPlus className="ms-2 h-4 w-4" />
            {t("admin.addRiderButton")}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" title={t("admin.editRiderTooltip")}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("admin.addRiderTitle") : t("admin.editRiderTitle")}
          </DialogTitle>
          <DialogDescription>{t("admin.riderFormDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.tableIqama")}</Label>
              <Input value={iqama} onChange={(e) => setIqama(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.tableIdNumber")}</Label>
              <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.riderNameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.riderPhotoLabel")}</Label>
            <div className="flex items-center gap-2">
              {photo && (
                <img
                  src={photo}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                />
              )}
              <Input
                value={photo}
                onChange={(e) => setPhoto(e.target.value)}
                dir="ltr"
                placeholder="https://..."
                className="flex-1"
              />
            </div>
            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoFile}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploadingPhoto}
              onClick={() => photoFileRef.current?.click()}
            >
              {uploadingPhoto ? (
                <Loader2 className="ms-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="ms-1.5 h-4 w-4" />
              )}
              {t("admin.uploadPhotoButton")}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.riderAreaLabel")}</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("admin.riderExtraLabel")}</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setExtraRows((rows) => [...rows, { key: "", value: "" }])}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {extraRows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={row.key}
                  onChange={(e) =>
                    setExtraRows((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)),
                    )
                  }
                  placeholder={t("admin.riderExtraKeyPlaceholder")}
                  className="flex-1"
                />
                <Input
                  value={row.value}
                  onChange={(e) =>
                    setExtraRows((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                    )
                  }
                  placeholder={t("admin.riderExtraValuePlaceholder")}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setExtraRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminRiders() {
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const rosterFn = useServerFn(uploadRoster);
  const deleteRosterFn = useServerFn(deleteRoster);
  const rosterUrlFn = useServerFn(getRosterDownloadUrl);
  const setRiderBlockedFn = useServerFn(setRiderBlocked);
  const bulkSetBlockedFn = useServerFn(bulkSetRidersBlocked);
  const setRiderPasswordFn = useServerFn(setRiderPassword);
  const createRiderFn = useServerFn(createRider);
  const updateRiderFn = useServerFn(updateRider);
  const deleteRiderFn = useServerFn(deleteRider);
  const bulkDeleteFn = useServerFn(bulkDeleteRiders);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });
  const isStaff = !!adminCheck.data?.isStaff;
  // Roster upload/delete and adding brand-new riders stay admin-only
  // regardless of riders_access — those are whole-directory operations, not
  // scoped to a single rider. Editing an existing rider (data, password,
  // block/unblock) is allowed for staff whose riders_access is 'full'.
  const canManageRoster = !isStaff;
  const canEditRiders = !isStaff || adminCheck.data?.ridersAccess === "full";
  const canDeleteRiders = !!adminCheck.data?.canDeleteRiders;
  const canBlockRiders = !!adminCheck.data?.canBlockRiders;

  const ridersQuery = useQuery({
    queryKey: ["company-riders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("riders")
        .select(
          "id, iqama_number, id_number, rider_name, photo_url, photo_rotation, area, extra, is_blocked, password_hash",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  // Any column the directory sheet carried beyond Iqama/ID/name/photo is
  // kept per-rider in `extra`; surface all of them as table columns.
  const extraColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const r of ridersQuery.data ?? []) {
      const e = riderExtra(r.extra);
      for (const k of Object.keys(e)) keys.add(k);
    }
    return [...keys];
  }, [ridersQuery.data]);

  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [rosterUploading, setRosterUploading] = useState(false);
  const rosterFileRef = useRef<HTMLInputElement>(null);
  const [riderSearch, setRiderSearch] = useState("");
  const [blockingRiderId, setBlockingRiderId] = useState<string | null>(null);
  const [pwRiderId, setPwRiderId] = useState<string | null>(null);
  const [rosterDeleting, setRosterDeleting] = useState(false);
  const [savingRiderId, setSavingRiderId] = useState<string | "new" | null>(null);
  const [viewMode, setViewMode] = useViewMode("riders-view-mode");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBlocking, setBulkBlocking] = useState(false);
  const [blockingAll, setBlockingAll] = useState(false);

  const handleCreateRider = async (values: RiderFormValues) => {
    setSavingRiderId("new");
    try {
      await createRiderFn({ data: values });
      toast.success(t("admin.toastRiderAdded"));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("admin.toastRiderSaveFailed")));
      return false;
    } finally {
      setSavingRiderId(null);
    }
  };

  const handleUpdateRider = async (riderId: string, values: RiderFormValues) => {
    setSavingRiderId(riderId);
    try {
      await updateRiderFn({ data: { riderId, ...values } });
      toast.success(t("admin.toastRiderUpdated"));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("admin.toastRiderSaveFailed")));
      return false;
    } finally {
      setSavingRiderId(null);
    }
  };

  const toggleRiderBlocked = async (riderId: string, blocked: boolean) => {
    setBlockingRiderId(riderId);
    try {
      await setRiderBlockedFn({ data: { riderId, blocked } });
      toast.success(blocked ? t("admin.toastRiderBlocked") : t("admin.toastRiderUnblocked"));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastRiderBlockFailed")));
    } finally {
      setBlockingRiderId(null);
    }
  };

  const handleDeleteRider = async (riderId: string, deleteReports: boolean) => {
    try {
      await deleteRiderFn({ data: { riderId, deleteReports } });
      toast.success(t("admin.toastRiderDeleted"));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("admin.toastRiderDeleteFailed")));
      return false;
    }
  };

  const handleSetRiderPassword = async (riderId: string, password: string) => {
    setPwRiderId(riderId);
    try {
      const res = await setRiderPasswordFn({ data: { riderId, password } });
      toast.success(
        res.cleared ? t("admin.toastRiderPasswordCleared") : t("admin.toastRiderPasswordSet"),
      );
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("admin.toastRiderPasswordFailed")));
      return false;
    } finally {
      setPwRiderId(null);
    }
  };

  const filteredRiders = useMemo(() => {
    const rows = ridersQuery.data ?? [];
    const q = riderSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.rider_name,
        r.iqama_number,
        r.id_number,
        ...Object.values(riderExtra(r.extra)).map((v) => (v == null ? "" : String(v))),
      ];
      return haystack.some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [ridersQuery.data, riderSearch]);

  const allVisibleSelected =
    filteredRiders.length > 0 && filteredRiders.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = filteredRiders.some((r) => selectedIds.has(r.id));

  const toggleSelectRider = (riderId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(riderId);
      else next.delete(riderId);
      return next;
    });
  };

  const toggleSelectAllVisible = (selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of filteredRiders) {
        if (selected) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkBlock = async () => {
    const ids = [...selectedIds];
    setBulkBlocking(true);
    try {
      const { updated } = await bulkSetBlockedFn({ data: { riderIds: ids, blocked: true } });
      toast.success(t("admin.toastBulkBlocked").replace("{count}", String(updated)));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
      clearSelection();
    } catch (err) {
      toast.error(errText(err, t("admin.toastBulkBlockFailed")));
    } finally {
      setBulkBlocking(false);
    }
  };

  // The header's standalone "block everyone" shortcut — every rider in the
  // directory, regardless of the search box or any selection.
  const handleBlockAllRiders = async () => {
    const ids = (ridersQuery.data ?? []).map((r) => r.id);
    if (ids.length === 0) return;
    setBlockingAll(true);
    try {
      const { updated } = await bulkSetBlockedFn({ data: { riderIds: ids, blocked: true } });
      toast.success(t("admin.toastBulkBlocked").replace("{count}", String(updated)));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastBulkBlockFailed")));
    } finally {
      setBlockingAll(false);
    }
  };

  const handleBulkDelete = async (riderIds: string[], deleteReports: boolean) => {
    try {
      const { deleted } = await bulkDeleteFn({ data: { riderIds, deleteReports } });
      toast.success(t("admin.toastBulkDeleted").replace("{count}", String(deleted)));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
      clearSelection();
      return true;
    } catch (err) {
      toast.error(errText(err, t("admin.toastBulkDeleteFailed")));
      return false;
    }
  };

  const handleRosterUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterFile) return toast.error(t("admin.toastSelectFile"));
    setRosterUploading(true);
    try {
      // Loaded on demand — the xlsx parser is a ~480KB dependency this page
      // only needs at the moment a file is actually being uploaded.
      const { parseExcelFile } = await import("@/lib/excel");
      const parsed = await parseExcelFile(rosterFile);
      if (!parsed.iqamaColumn && !parsed.idColumn) {
        throw new Error(t("admin.toastNoIqamaColumn"));
      }
      if (parsed.rows.length === 0) throw new Error(t("admin.toastEmptyFile"));

      // Keep the raw sheet for re-download. Storage keys reject non-ASCII, so
      // the path never embeds the original name — that's kept separately.
      const companyId = adminCheck.data?.companyId;
      const extMatch = /\.[a-zA-Z0-9]+$/.exec(rosterFile.name);
      const safeExt = extMatch ? extMatch[0] : "";
      const path = companyId ? `${companyId}/${Date.now()}${safeExt}` : null;
      if (path) {
        const { error: upErr } = await supabase.storage
          .from("rosters")
          .upload(path, rosterFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
      }

      const res = await rosterFn({
        data: {
          headers: parsed.headers,
          iqamaColumn: parsed.iqamaColumn,
          idColumn: parsed.idColumn,
          nameColumn: parsed.nameColumn,
          photoColumn: parsed.photoColumn,
          areaColumn: parsed.areaColumn,
          storagePath: path,
          fileName: rosterFile.name,
          rows: parsed.rows as Record<string, unknown>[],
        },
      });
      const skippedNote = res.skipped
        ? lang === "ar"
          ? `، ${res.skipped} متخطى`
          : `, ${res.skipped} skipped`
        : "";
      toast.success(
        lang === "ar"
          ? `تم تحديث بيانات المناديب (${res.created} جديد، ${res.updated} محدّث${skippedNote})`
          : `Rider directory updated (${res.created} new, ${res.updated} updated${skippedNote})`,
      );
      setRosterFile(null);
      if (rosterFileRef.current) rosterFileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      console.error("uploadRoster failed", err);
      toast.error(errText(err, t("admin.toastRosterFailed")));
    } finally {
      setRosterUploading(false);
    }
  };

  const handleRosterDownload = async () => {
    try {
      const { url } = await rosterUrlFn();
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("admin.toastDownloadFailed")));
    }
  };

  // A fresh Excel export of whatever rider rows are handed to it — unlike
  // the original uploaded sheet above, this also reflects riders added or
  // edited by hand since that upload. Shared by the "export everyone" header
  // button and the selection toolbar's "export selected" action.
  //
  // xlsx is loaded on demand — a ~480KB dependency this page only needs at
  // the moment an export is actually requested.
  const exportRidersToExcel = async (
    riders: NonNullable<typeof ridersQuery.data>,
    filenameSuffix: string,
  ) => {
    const XLSX = await import("xlsx");
    const rows = riders.map((r) => {
      const extra = riderExtra(r.extra);
      const row: Record<string, unknown> = {
        [t("admin.riderNameLabel")]: r.rider_name ?? "",
        [t("admin.tableIqama")]: r.iqama_number ?? "",
        [t("admin.tableIdNumber")]: r.id_number ?? "",
        [t("admin.riderAreaLabel")]: r.area ?? "",
      };
      for (const col of extraColumns) row[col] = extra[col] ?? "";
      row[t("admin.tableStatus")] = r.is_blocked ? t("admin.riderBlockedLabel") : "";
      return row;
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Riders");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const datePart = new Date().toISOString().slice(0, 10);
    link.download = `riders${filenameSuffix ? `-${filenameSuffix}` : ""}-${datePart}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => exportRidersToExcel(ridersQuery.data ?? [], "");

  const handleExportSelected = () => {
    const rows = (ridersQuery.data ?? []).filter((r) => selectedIds.has(r.id));
    exportRidersToExcel(rows, "selected");
  };

  const handleRosterDelete = async () => {
    setRosterDeleting(true);
    try {
      const res = await deleteRosterFn();
      toast.success(
        lang === "ar"
          ? `تم حذف بيانات المناديب (${res.deleted} مندوب)`
          : `Rider directory deleted (${res.deleted} riders removed)`,
      );
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
      queryClient.invalidateQueries({ queryKey: ["company-riders-count"] });
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastRosterDeleteFailed")));
    } finally {
      setRosterDeleting(false);
    }
  };

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t("admin.rosterCardTitle")}
        </CardTitle>
        <CardDescription>{t("admin.rosterCardDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManageRoster && (
          <>
            <form onSubmit={handleRosterUpload} className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>{t("admin.rosterFileLabel")}</Label>
                <Input
                  ref={rosterFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setRosterFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={rosterUploading || !rosterFile}
                  className="w-full transition-transform active:scale-[0.98]"
                >
                  {rosterUploading ? (
                    <>
                      <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                      {t("admin.rosterUploadingButton")}
                    </>
                  ) : (
                    <>
                      <Upload className="ms-2 h-4 w-4" />
                      {t("admin.rosterUploadButton")}
                    </>
                  )}
                </Button>
              </div>
            </form>

            {adminCheck.data?.rosterFileName && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {adminCheck.data.rosterFileName}
                  </div>
                  {adminCheck.data.rosterUploadedAt && (
                    <div className="text-[11px] text-muted-foreground">
                      {formatDateTime(adminCheck.data.rosterUploadedAt)}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRosterDownload}
                  title={t("admin.rosterDownloadButton")}
                >
                  <Download className="ms-1.5 h-4 w-4" />
                  {t("admin.rosterDownloadButton")}
                </Button>
              </div>
            )}
          </>
        )}

        <div>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">
              {t("admin.registeredRidersTitle")}{" "}
              <span className="text-muted-foreground">({ridersQuery.data?.length ?? 0})</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ViewModeToggle mode={viewMode} onChange={setViewMode} />
              {(ridersQuery.data?.length ?? 0) > 0 && (
                <Button size="sm" variant="outline" onClick={handleExportExcel}>
                  <Download className="ms-1.5 h-4 w-4" />
                  {t("admin.exportExcelButton")}
                </Button>
              )}
              {canManageRoster && (
                <RiderFormDialog
                  mode="create"
                  saving={savingRiderId === "new"}
                  t={t}
                  onSubmit={handleCreateRider}
                />
              )}
              {canBlockRiders && (ridersQuery.data?.length ?? 0) > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={blockingAll}
                    >
                      {blockingAll ? (
                        <Loader2 className="ms-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="ms-1.5 h-4 w-4" />
                      )}
                      {t("admin.blockAllButton")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("admin.blockAllConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("admin.blockAllConfirmDesc").replace(
                          "{count}",
                          String(ridersQuery.data?.length ?? 0),
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleBlockAllRiders}
                      >
                        {t("admin.blockAllButton")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {canManageRoster && (ridersQuery.data?.length ?? 0) > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={rosterDeleting}
                    >
                      {rosterDeleting ? (
                        <Loader2 className="ms-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="ms-1.5 h-4 w-4" />
                      )}
                      {t("admin.rosterDeleteButton")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("admin.rosterDeleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("admin.rosterDeleteDesc")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleRosterDelete}
                      >
                        {t("admin.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          {ridersQuery.isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {ridersQuery.data && ridersQuery.data.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("admin.noRidersYet")}
            </p>
          )}
          {ridersQuery.data && ridersQuery.data.length > 0 && (
            <>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={riderSearch}
                  onChange={(e) => setRiderSearch(e.target.value)}
                  placeholder={t("admin.riderSearchPlaceholder")}
                  className="pe-9"
                />
              </div>
              {canEditRiders && filteredRiders.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={
                        allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false
                      }
                      onCheckedChange={(v) => toggleSelectAllVisible(!!v)}
                    />
                    {selectedIds.size > 0
                      ? t("admin.selectedCount").replace("{count}", String(selectedIds.size))
                      : t("admin.selectAllRidersLabel")}
                  </label>
                  {selectedIds.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={handleExportSelected}>
                        <Download className="ms-1.5 h-4 w-4" />
                        {t("admin.exportSelectedButton")}
                      </Button>
                      {canBlockRiders && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={bulkBlocking}
                              className="text-destructive hover:text-destructive"
                            >
                              {bulkBlocking ? (
                                <Loader2 className="ms-1.5 h-4 w-4 animate-spin" />
                              ) : (
                                <Ban className="ms-1.5 h-4 w-4" />
                              )}
                              {t("admin.bulkBlockButton")}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("admin.bulkBlockConfirmTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("admin.bulkBlockConfirmDesc").replace(
                                  "{count}",
                                  String(selectedIds.size),
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={handleBulkBlock}
                              >
                                {t("admin.bulkBlockButton")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {canDeleteRiders && (
                        <BulkDeleteRidersDialog
                          riderIds={[...selectedIds]}
                          t={t}
                          onDelete={handleBulkDelete}
                        />
                      )}
                      <Button size="sm" variant="ghost" onClick={clearSelection}>
                        <X className="ms-1.5 h-4 w-4" />
                        {t("admin.clearSelectionButton")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {filteredRiders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("admin.riderSearchNoResults")}
                </p>
              ) : viewMode === "table" ? (
                <div className="overflow-hidden rounded-xl border">
                  <div className="max-h-[26rem] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                        <TableRow className="hover:bg-transparent">
                          {canEditRiders && (
                            <TableHead className="w-8">
                              <Checkbox
                                checked={
                                  allVisibleSelected
                                    ? true
                                    : someVisibleSelected
                                      ? "indeterminate"
                                      : false
                                }
                                onCheckedChange={(v) => toggleSelectAllVisible(!!v)}
                                aria-label={t("admin.selectAllRidersLabel")}
                              />
                            </TableHead>
                          )}
                          <TableHead className="min-w-[180px]">{t("admin.tableRider")}</TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("admin.tableIqama")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("admin.tableIdNumber")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("admin.riderAreaLabel")}
                          </TableHead>
                          {extraColumns.map((col) => (
                            <TableHead key={col} className="whitespace-nowrap">
                              {col}
                            </TableHead>
                          ))}
                          <TableHead className="whitespace-nowrap text-end">
                            {t("admin.tableStatus")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRiders.map((r) => {
                          const extra = riderExtra(r.extra);
                          return (
                            <TableRow
                              key={r.id}
                              className={r.is_blocked ? "bg-destructive/5" : undefined}
                            >
                              {canEditRiders && (
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIds.has(r.id)}
                                    onCheckedChange={(v) => toggleSelectRider(r.id, !!v)}
                                    aria-label={t("admin.selectRiderLabel")}
                                  />
                                </TableCell>
                              )}
                              <TableCell>
                                <div className="flex items-center gap-2.5">
                                  {r.photo_url ? (
                                    <RiderPhoto
                                      riderId={r.id}
                                      src={r.photo_url}
                                      alt={r.rider_name ?? ""}
                                      rotation={r.photo_rotation}
                                      canRotate={canEditRiders}
                                      className="h-9 w-9 shrink-0 rounded-full border border-border"
                                    />
                                  ) : (
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                      <Users className="h-4 w-4" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">
                                      {r.rider_name || "—"}
                                    </div>
                                    {r.is_blocked && (
                                      <div className="text-[11px] font-medium text-destructive">
                                        {t("admin.riderBlockedLabel")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {r.iqama_number || "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {r.id_number || "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {r.area || "—"}
                              </TableCell>
                              {extraColumns.map((col) => {
                                const v = extra[col];
                                return (
                                  <TableCell
                                    key={col}
                                    className="whitespace-nowrap text-xs text-muted-foreground"
                                  >
                                    {v == null || v === "" ? "—" : String(v)}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-end">
                                <div className="flex items-center justify-end gap-1">
                                  {canEditRiders ? (
                                    <>
                                      <RiderFormDialog
                                        mode="edit"
                                        rider={r}
                                        saving={savingRiderId === r.id}
                                        t={t}
                                        onSubmit={(values) => handleUpdateRider(r.id, values)}
                                      />
                                      <RiderPasswordAdminDialog
                                        riderId={r.id}
                                        riderName={r.rider_name}
                                        hasPassword={!!r.password_hash}
                                        saving={pwRiderId === r.id}
                                        t={t}
                                        onSubmit={handleSetRiderPassword}
                                      />
                                      {canBlockRiders && (
                                        <Button
                                          size="sm"
                                          variant={r.is_blocked ? "outline" : "ghost"}
                                          disabled={blockingRiderId === r.id}
                                          onClick={() => toggleRiderBlocked(r.id, !r.is_blocked)}
                                          className={
                                            r.is_blocked
                                              ? "text-primary"
                                              : "text-destructive hover:text-destructive"
                                          }
                                        >
                                          {blockingRiderId === r.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : r.is_blocked ? (
                                            <>
                                              <Eye className="ms-1.5 h-4 w-4" />
                                              {t("admin.riderUnblockButton")}
                                            </>
                                          ) : (
                                            <>
                                              <Ban className="ms-1.5 h-4 w-4" />
                                              {t("admin.riderBlockButton")}
                                            </>
                                          )}
                                        </Button>
                                      )}
                                      {canDeleteRiders && (
                                        <DeleteRiderDialog
                                          riderId={r.id}
                                          riderName={r.rider_name}
                                          t={t}
                                          onDelete={handleDeleteRider}
                                        />
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredRiders.map((r, i) => {
                    const extra = riderExtra(r.extra);
                    const extraEntries = extraColumns
                      .map((col) => [col, extra[col]] as const)
                      .filter(([, v]) => v != null && v !== "");
                    return (
                      <div
                        key={r.id}
                        className={`animate-in fade-in relative flex flex-col items-center rounded-xl border p-5 text-center duration-300 fill-mode-[backwards] ${
                          r.is_blocked ? "bg-destructive/5" : "bg-card"
                        }`}
                        style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                      >
                        {canEditRiders && (
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={(v) => toggleSelectRider(r.id, !!v)}
                            aria-label={t("admin.selectRiderLabel")}
                            className="absolute start-3 top-3 bg-background"
                          />
                        )}
                        {r.photo_url ? (
                          <RiderPhoto
                            riderId={r.id}
                            src={r.photo_url}
                            alt={r.rider_name ?? ""}
                            rotation={r.photo_rotation}
                            canRotate={canEditRiders}
                            className="h-28 w-28 shrink-0 rounded-full border border-border"
                          />
                        ) : (
                          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <Users className="h-10 w-10" />
                          </div>
                        )}
                        <div className="mt-3 w-full min-w-0">
                          <div className="truncate text-base font-semibold">
                            {r.rider_name || "—"}
                          </div>
                          {r.is_blocked && (
                            <div className="mt-0.5 text-xs font-medium text-destructive">
                              {t("admin.riderBlockedLabel")}
                            </div>
                          )}
                          {r.iqama_number && (
                            <div
                              className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              {t("admin.tableIqama")}: {r.iqama_number}
                            </div>
                          )}
                          {r.id_number && (
                            <div
                              className="truncate font-mono text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              ID: {r.id_number}
                            </div>
                          )}
                          {r.area && (
                            <div className="mt-1 text-xs text-muted-foreground">{r.area}</div>
                          )}
                        </div>

                        {extraEntries.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                            {extraEntries.map(([col, v]) => (
                              <Badge key={col} variant="outline" className="text-[10px]">
                                {col}: {String(v)}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-1">
                          {canEditRiders ? (
                            <>
                              <RiderFormDialog
                                mode="edit"
                                rider={r}
                                saving={savingRiderId === r.id}
                                t={t}
                                onSubmit={(values) => handleUpdateRider(r.id, values)}
                              />
                              <RiderPasswordAdminDialog
                                riderId={r.id}
                                riderName={r.rider_name}
                                hasPassword={!!r.password_hash}
                                saving={pwRiderId === r.id}
                                t={t}
                                onSubmit={handleSetRiderPassword}
                              />
                              {canBlockRiders && (
                                <Button
                                  size="sm"
                                  variant={r.is_blocked ? "outline" : "ghost"}
                                  disabled={blockingRiderId === r.id}
                                  onClick={() => toggleRiderBlocked(r.id, !r.is_blocked)}
                                  className={
                                    r.is_blocked
                                      ? "text-primary"
                                      : "text-destructive hover:text-destructive"
                                  }
                                >
                                  {blockingRiderId === r.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : r.is_blocked ? (
                                    <>
                                      <Eye className="ms-1.5 h-4 w-4" />
                                      {t("admin.riderUnblockButton")}
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="ms-1.5 h-4 w-4" />
                                      {t("admin.riderBlockButton")}
                                    </>
                                  )}
                                </Button>
                              )}
                              {canDeleteRiders && (
                                <DeleteRiderDialog
                                  riderId={r.id}
                                  riderName={r.rider_name}
                                  t={t}
                                  onDelete={handleDeleteRider}
                                />
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
