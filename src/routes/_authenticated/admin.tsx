import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Bell,
  Building2,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Search,
  Trash2,
  Upload,
  Users,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { checkIsAdmin, deleteReport, uploadReport } from "@/lib/reports.functions";
import {
  uploadRoster,
  deleteRoster,
  getRosterDownloadUrl,
  setRiderBlocked,
} from "@/lib/riders.functions";
import { updateCompanyLogo, updateCompanyName } from "@/lib/accounts.functions";
import { listAnnouncements, markAnnouncementsRead } from "@/lib/announcements.functions";
import { parseExcelFile, monthLabel, MONTH_NAMES_AR, MONTH_NAMES_EN } from "@/lib/excel";
import { ChangeNameDialog, ChangeLogoDialog } from "@/components/company-dialogs";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function riderExtra(extra: unknown): Record<string, unknown> {
  return extra && typeof extra === "object" && !Array.isArray(extra)
    ? (extra as Record<string, unknown>)
    : {};
}

// Surface *something* useful whatever shape the failure arrives in — a plain
// Error, a serverFn wrapper, a swallowed gateway 500, an abort/timeout.
function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const uploadFn = useServerFn(uploadReport);
  const rosterFn = useServerFn(uploadRoster);
  const deleteRosterFn = useServerFn(deleteRoster);
  const rosterUrlFn = useServerFn(getRosterDownloadUrl);
  const setRiderBlockedFn = useServerFn(setRiderBlocked);
  const deleteFn = useServerFn(deleteReport);
  const listAnnouncementsFn = useServerFn(listAnnouncements);
  const markAnnouncementsReadFn = useServerFn(markAnnouncementsRead);
  const updateNameFn = useServerFn(updateCompanyName);
  const updateLogoFn = useServerFn(updateCompanyLogo);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });

  const announcementsQuery = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncementsFn(),
    enabled: !!adminCheck.data?.isAdmin,
    refetchInterval: 60_000,
  });

  const reportsQuery = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const ridersQuery = useQuery({
    queryKey: ["company-riders"],
    enabled: !!adminCheck.data?.companyId && !adminCheck.data?.isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("riders")
        .select("id, iqama_number, id_number, rider_name, photo_url, extra, is_blocked")
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

  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploadMode, setUploadMode] = useState<"new" | "replace" | "merge">("new");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [rosterUploading, setRosterUploading] = useState(false);
  const rosterFileRef = useRef<HTMLInputElement>(null);
  const [riderSearch, setRiderSearch] = useState("");
  const [blockingRiderId, setBlockingRiderId] = useState<string | null>(null);

  const toggleRiderBlocked = async (riderId: string, blocked: boolean) => {
    setBlockingRiderId(riderId);
    try {
      await setRiderBlockedFn({ data: { riderId, blocked } });
      toast.success(blocked ? t("admin.toastRiderBlocked") : t("admin.toastRiderUnblocked"));
      queryClient.invalidateQueries({ queryKey: ["company-riders"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastRiderBlockFailed")));
    } finally {
      setBlockingRiderId(null);
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

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t("admin.toastSelectFile"));
    setUploading(true);
    try {
      const parsed = await parseExcelFile(file);
      if (!parsed.iqamaColumn && !parsed.idColumn) {
        throw new Error(t("admin.toastNoIqamaColumn"));
      }
      if (parsed.rows.length === 0) throw new Error(t("admin.toastEmptyFile"));

      // Upload raw file to storage. Supabase Storage object keys reject
      // non-ASCII characters (e.g. Arabic file names) and some symbols, so
      // the storage path must not embed the raw file name — the original
      // name is kept separately in fileName/reports.file_name for display.
      // In "merge" mode the month's report already has a stored file, so
      // this extra sheet isn't uploaded (its columns just merge into the DB).
      let path: string | null = null;
      if (uploadMode !== "merge") {
        const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
        const safeExt = extMatch ? extMatch[0] : "";
        path = `${year}/${String(month).padStart(2, "0")}-${Date.now()}${safeExt}`;
        const { error: upErr } = await supabase.storage
          .from("reports")
          .upload(path, file, { upsert: true });
        if (upErr) throw new Error(upErr.message);
      }

      const res = await uploadFn({
        data: {
          month,
          year,
          fileName: file.name,
          storagePath: path,
          headers: parsed.headers,
          iqamaColumn: parsed.iqamaColumn,
          idColumn: parsed.idColumn,
          nameColumn: parsed.nameColumn,
          rows: parsed.rows as Record<string, unknown>[],
          mode: uploadMode,
          note: note.trim() || null,
        },
      });
      toast.success(
        lang === "ar"
          ? res.merged
            ? `تم دمج الشيت مع تقرير الشهر (${res.count} مندوب)`
            : `تم رفع التقرير بنجاح (${res.count} مندوب)`
          : res.merged
            ? `Sheet merged into the month's report (${res.count} riders)`
            : `Report uploaded successfully (${res.count} riders)`,
      );
      setFile(null);
      setNote("");
      setUploadMode("new");
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
    } catch (err) {
      console.error("uploadReport failed", err);
      toast.error(errText(err, t("admin.toastUploadFailed")));
    } finally {
      setUploading(false);
    }
  };

  const handleRosterUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterFile) return toast.error(t("admin.toastSelectFile"));
    setRosterUploading(true);
    try {
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
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      console.error("uploadRoster failed", err);
      toast.error(errText(err, t("admin.toastRosterFailed")));
    } finally {
      setRosterUploading(false);
    }
  };

  const [rosterDeleting, setRosterDeleting] = useState(false);

  const handleRosterDownload = async () => {
    try {
      const { url } = await rosterUrlFn();
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("admin.toastDownloadFailed")));
    }
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
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastRosterDeleteFailed")));
    } finally {
      setRosterDeleting(false);
    }
  };

  const handleSaveNote = async (id: string, value: string) => {
    const { error } = await supabase
      .from("reports")
      .update({ note: value.trim() || null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
  };

  const handleDownload = async (storagePath: string | null, fileName: string) => {
    if (!storagePath) return toast.error(t("admin.toastDownloadFailed"));
    const { data, error } = await supabase.storage
      .from("reports")
      .createSignedUrl(storagePath, 60, { download: fileName });
    if (error || !data) return toast.error(error?.message ?? t("admin.toastDownloadFailed"));
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFn({ data: { id } });
      toast.success(t("admin.toastDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.message ?? t("admin.toastDeleteFailed"));
    }
  };

  if (adminCheck.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (adminCheck.data?.isSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  if (!adminCheck.data?.isAdmin || !adminCheck.data?.companyId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="animate-in fade-in slide-in-from-bottom-2 max-w-md duration-500">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold">{t("admin.unauthorizedTitle")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.unauthorizedDesc")}</p>
            <Button variant="outline" className="mt-4" onClick={signOut}>
              {t("admin.signOutButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (adminCheck.data.isSuspended) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="animate-in fade-in slide-in-from-bottom-2 max-w-md duration-500">
          <CardContent className="pt-6 text-center">
            <Lock className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold">{t("admin.suspendedTitle")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.suspendedDesc")}</p>
            <Button variant="outline" className="mt-4" onClick={signOut}>
              {t("admin.signOutButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalRiders = reportsQuery.data?.reduce((s, r) => s + (r.rider_count ?? 0), 0) ?? 0;
  const companyId = adminCheck.data?.companyId;
  const companyName = adminCheck.data?.companyName;
  const companyLogoUrl = adminCheck.data?.companyLogoUrl;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={companyName ?? ""}
                className="h-14 w-14 shrink-0 rounded-xl border border-border bg-background object-contain p-1"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-7 w-7" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold">{companyName ?? t("admin.headerTitle")}</h1>
              <p className="text-xs text-muted-foreground">
                {companyName ? t("admin.headerTitle") : t("admin.headerSubtitleDefault")}
              </p>
            </div>
            {companyId && (
              <div className="flex items-center gap-0.5">
                <ChangeNameDialog
                  currentName={companyName ?? ""}
                  t={t}
                  onSubmit={async (name) => {
                    await updateNameFn({ data: { id: companyId, name } });
                    toast.success(t("superAdmin.toastNameUpdated"));
                    queryClient.invalidateQueries({ queryKey: ["is-admin"] });
                  }}
                />
                <ChangeLogoDialog
                  companyName={companyName ?? ""}
                  currentLogoUrl={companyLogoUrl ?? null}
                  t={t}
                  onSubmit={async (logoUrl) => {
                    await updateLogoFn({ data: { id: companyId, logoUrl } });
                    toast.success(t("superAdmin.toastLogoUpdated"));
                    queryClient.invalidateQueries({ queryKey: ["is-admin"] });
                  }}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell
              announcements={announcementsQuery.data?.announcements ?? []}
              unreadCount={announcementsQuery.data?.unreadCount ?? 0}
              lang={lang}
              t={t}
              onOpen={() => {
                const unreadIds = (announcementsQuery.data?.announcements ?? [])
                  .filter((a) => !a.isRead)
                  .map((a) => a.id);
                if (unreadIds.length === 0) return;
                markAnnouncementsReadFn({ data: { ids: unreadIds } }).then(() =>
                  queryClient.invalidateQueries({ queryKey: ["announcements"] }),
                );
              }}
            />
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="ms-2 h-4 w-4" />
              {t("admin.logout")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("admin.statReportsCount")}
            value={reportsQuery.data?.length ?? 0}
            icon={FileSpreadsheet}
            delay={0}
          />
          <StatCard
            label={t("admin.statRegisteredRiders")}
            value={ridersQuery.data?.length ?? 0}
            icon={Users}
            delay={80}
          />
          <StatCard
            label={t("admin.statTotalRiders")}
            value={totalRiders}
            icon={Users}
            delay={160}
          />
          <StatCard
            label={t("admin.statLastReport")}
            value={
              reportsQuery.data?.[0]
                ? monthLabel(reportsQuery.data[0].month, reportsQuery.data[0].year, lang)
                : "—"
            }
            icon={CheckCircle2}
            delay={240}
          />
        </div>

        <Card
          className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
          style={{ animationDelay: "200ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("admin.rosterCardTitle")}
            </CardTitle>
            <CardDescription>{t("admin.rosterCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                      {new Date(adminCheck.data.rosterUploadedAt).toLocaleString(
                        lang === "ar" ? "ar-SA" : "en-US",
                      )}
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

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t("admin.registeredRidersTitle")}{" "}
                  <span className="text-muted-foreground">({ridersQuery.data?.length ?? 0})</span>
                </p>
                {(ridersQuery.data?.length ?? 0) > 0 && (
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
                        <AlertDialogDescription>
                          {t("admin.rosterDeleteDesc")}
                        </AlertDialogDescription>
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
                  {filteredRiders.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t("admin.riderSearchNoResults")}
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border">
                      <div className="max-h-[26rem] overflow-auto">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="min-w-[180px]">
                                {t("admin.tableRider")}
                              </TableHead>
                              <TableHead className="whitespace-nowrap">
                                {t("admin.tableIqama")}
                              </TableHead>
                              <TableHead className="whitespace-nowrap">
                                {t("admin.tableIdNumber")}
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
                                  <TableCell>
                                    <div className="flex items-center gap-2.5">
                                      {r.photo_url ? (
                                        <img
                                          src={r.photo_url}
                                          alt={r.rider_name ?? ""}
                                          className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
                                          loading="lazy"
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
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
          style={{ animationDelay: "220ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t("admin.uploadCardTitle")}
            </CardTitle>
            <CardDescription>{t("admin.uploadCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>{t("admin.monthLabel")}</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(lang === "ar" ? MONTH_NAMES_AR : MONTH_NAMES_EN).map((n, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {n} ({String(i + 1).padStart(2, "0")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.yearLabel")}</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("admin.excelFileLabel")}</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-2 md:col-span-4">
                <Label>{t("admin.noteLabel")}</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("admin.notePlaceholder")}
                  rows={2}
                />
              </div>
              <div className="space-y-2 md:col-span-4">
                <Label>{t("admin.uploadModeLabel")}</Label>
                <Select
                  value={uploadMode}
                  onValueChange={(v) => setUploadMode(v as "new" | "replace" | "merge")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">{t("admin.modeNew")}</SelectItem>
                    <SelectItem value="replace">{t("admin.modeReplace")}</SelectItem>
                    <SelectItem value="merge">{t("admin.modeMerge")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {uploadMode === "merge"
                    ? t("admin.modeMergeHint")
                    : uploadMode === "replace"
                      ? t("admin.modeReplaceHint")
                      : t("admin.modeNewHint")}
                </p>
              </div>
              <div className="md:col-span-4 flex items-center justify-end">
                <Button
                  type="submit"
                  disabled={uploading || !file}
                  className="transition-transform active:scale-[0.98]"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                      {t("admin.uploadingButton")}
                    </>
                  ) : (
                    <>
                      <Upload className="ms-2 h-4 w-4" />
                      {t("admin.uploadButton")}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card
          className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
          style={{ animationDelay: "280ms" }}
        >
          <CardHeader>
            <CardTitle>{t("admin.uploadedReportsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {reportsQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {reportsQuery.data && reportsQuery.data.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("admin.noReportsYet")}
              </p>
            )}
            {reportsQuery.data && reportsQuery.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.tableMonth")}</TableHead>
                    <TableHead>{t("admin.tableYear")}</TableHead>
                    <TableHead>{t("admin.tableFileName")}</TableHead>
                    <TableHead>{t("admin.tableRiderCount")}</TableHead>
                    <TableHead>{t("admin.tableUploadDate")}</TableHead>
                    <TableHead className="text-end">{t("admin.tableActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportsQuery.data.map((r, i) => (
                    <TableRow
                      key={r.id}
                      className="animate-in fade-in transition-colors duration-300 fill-mode-[backwards]"
                      style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                    >
                      <TableCell className="font-medium">
                        {(lang === "ar" ? MONTH_NAMES_AR : MONTH_NAMES_EN)[r.month - 1]}
                      </TableCell>
                      <TableCell>{r.year}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.file_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.rider_count}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString(
                          lang === "ar" ? "ar-SA" : "en-US",
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t("admin.downloadTooltip")}
                          className="transition-transform hover:scale-110"
                          onClick={() => handleDownload(r.storage_path, r.file_name)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <NoteEditor
                          reportId={r.id}
                          initialNote={r.note}
                          title={monthLabel(r.month, r.year, lang)}
                          t={t}
                          onSave={handleSaveNote}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive transition-transform hover:scale-110"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("admin.deleteReportTitle")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {lang === "ar"
                                  ? `سيتم حذف تقرير ${monthLabel(r.month, r.year, lang)} وجميع بيانات المناديب المرتبطة به. لا يمكن التراجع.`
                                  : `The ${monthLabel(r.month, r.year, lang)} report and all associated rider data will be deleted. This cannot be undone.`}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDelete(r.id)}
                              >
                                {t("admin.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
}

function NotificationBell({
  announcements,
  unreadCount,
  lang,
  t,
  onOpen,
}: {
  announcements: AnnouncementItem[];
  unreadCount: number;
  lang: "ar" | "en";
  t: (key: TranslationKey) => string;
  onOpen: () => void;
}) {
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {t("admin.notificationsTitle")}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {announcements.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("admin.notificationsEmpty")}
            </p>
          )}
          {announcements.map((a, i) => (
            <div
              key={a.id}
              className={`border-b px-4 py-3 last:border-b-0 ${!a.isRead ? "bg-primary/5" : ""}`}
              style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{a.title}</span>
                {!a.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {new Date(a.createdAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NoteEditor({
  reportId,
  initialNote,
  title,
  t,
  onSave,
}: {
  reportId: string;
  initialNote: string | null;
  title: string;
  t: (key: TranslationKey) => string;
  onSave: (id: string, value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(reportId, value);
      toast.success(t("admin.toastNoteSaved"));
      setOpen(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.message ?? t("admin.toastNoteSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(initialNote ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("admin.editNoteTooltip")}
          className={`transition-transform hover:scale-110 ${
            initialNote ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("admin.editNoteTitle")} — {title}
          </DialogTitle>
          <DialogDescription>{t("admin.editNoteDesc")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("admin.notePlaceholder")}
          rows={4}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            {t("admin.cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                {t("admin.saving")}
              </>
            ) : (
              t("admin.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  delay?: number;
}) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards] transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 hover:scale-110">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
