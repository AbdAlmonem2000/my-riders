import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  MessageSquare,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInputDMY } from "@/components/date-input-dmy";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  checkIsAdmin,
  deleteReport,
  deleteReportSheet,
  uploadReport,
} from "@/lib/reports.functions";
import { monthLabel, reportDateLabel } from "@/lib/month-label";
import { errText } from "@/lib/error-text";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { usePushDispatch } from "@/lib/push-client";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: AdminReports,
});

interface ReportSheet {
  id: string;
  file_name: string;
  storage_path: string | null;
  rider_count: number;
  created_at: string;
}

function ReportSheetsDialog({
  title,
  sheets,
  deletingSheetId,
  canDelete,
  t,
  onDownload,
  onDelete,
}: {
  title: string;
  sheets: ReportSheet[];
  deletingSheetId: string | null;
  canDelete: boolean;
  t: (key: TranslationKey) => string;
  onDownload: (storagePath: string | null, fileName: string) => void;
  onDelete: (sheetId: string) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("admin.sheetsTitle")}
          className="relative transition-transform hover:scale-110"
        >
          <Layers className="h-4 w-4" />
          {sheets.length > 1 && (
            <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {sheets.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("admin.sheetsTitle")} — {title}
          </DialogTitle>
          <DialogDescription>{t("admin.sheetsDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {sheets.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("admin.sheetsEmpty")}
            </p>
          )}
          {sheets.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.file_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatDateTime(s.created_at)} · {s.rider_count} {t("admin.statTotalRiders")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDownload(s.storage_path, s.file_name)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={deletingSheetId === s.id}
                      >
                        {deletingSheetId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.sheetDeleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {sheets.length === 1
                            ? t("admin.sheetDeleteLastDesc")
                            : t("admin.sheetDeleteDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => onDelete(s.id)}
                        >
                          {t("admin.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
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
    } catch (err) {
      toast.error(errText(err, t("admin.toastNoteSaveFailed")));
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

function AdminReports() {
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const uploadFn = useServerFn(uploadReport);
  const dispatchPush = usePushDispatch();
  const deleteFn = useServerFn(deleteReport);
  const deleteSheetFn = useServerFn(deleteReportSheet);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });
  // View-only staff can browse reports/sheets and download files, but never
  // upload, edit a note, or delete — enforced again server-side (and at the
  // RLS layer), this just keeps the UI from offering rejected actions.
  const canWrite = adminCheck.data ? adminCheck.data.reportsAccess === "full" : true;

  // This page (and its dashboard counterpart on the overview page) only
  // ever shows DAY reports now — a plain monthly report (day IS NULL,
  // including every one uploaded before the daily feature existed) has its
  // own separate page/dashboard instead of being mixed in here.
  const reportsQuery = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .not("day", "is", null)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("day", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const sheetsQuery = useQuery({
    queryKey: ["report-sheets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_sheets")
        .select("id, report_id, file_name, storage_path, rider_count, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const sheetRows = sheetsQuery.data;
  const sheetsByReport = useMemo(() => {
    const map = new Map<string, ReportSheet[]>();
    for (const s of sheetRows ?? []) {
      const list = map.get(s.report_id) ?? [];
      list.push(s);
      map.set(s.report_id, list);
    }
    return map;
  }, [sheetRows]);

  const now = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [now]);
  const [uploadDate, setUploadDate] = useState(todayIso);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploadMode, setUploadMode] = useState<"new" | "replace" | "merge">("new");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);

  // Grouped by calendar month so a month with every one of its 30 days
  // uploaded separately doesn't just show as 30 flat rows stacked on top of
  // each other — reportsQuery is already sorted newest-first, so building
  // this with a Map preserves that order for the groups themselves too.
  const monthGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; month: number; year: number; reports: NonNullable<typeof reportsQuery.data> }
    >();
    for (const r of reportsQuery.data ?? []) {
      const key = `${r.year}-${r.month}`;
      const g = map.get(key);
      if (g) g.reports.push(r);
      else map.set(key, { key, month: r.month, year: r.year, reports: [r] });
    }
    return [...map.values()];
  }, [reportsQuery.data]);

  // Collapsed, not expanded, is what's tracked — so every month starts
  // expanded (empty set) without needing to wait for the query to resolve
  // before seeding an initial "expand the first one" state.
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const toggleMonthCollapse = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectMonth = (ids: string[]) => {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t("admin.toastSelectFile"));
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(uploadDate);
    if (!dateMatch) return toast.error(t("admin.toastInvalidDate"));
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    setUploading(true);
    try {
      // Loaded on demand — the xlsx parser is a ~480KB dependency this page
      // only needs at the moment a file is actually being uploaded.
      const { parseExcelFile } = await import("@/lib/excel");
      const parsed = await parseExcelFile(file);
      if (!parsed.iqamaColumn && !parsed.idColumn) {
        throw new Error(t("admin.toastNoIqamaColumn"));
      }
      if (parsed.rows.length === 0) throw new Error(t("admin.toastEmptyFile"));

      // Upload raw file to storage. Supabase Storage object keys reject
      // non-ASCII characters (e.g. Arabic file names) and some symbols, so
      // the storage path must not embed the raw file name — the original
      // name is kept separately for display. Every sheet keeps its own file
      // so it can be downloaded or deleted individually later.
      const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
      const safeExt = extMatch ? extMatch[0] : "";
      const path = `${year}/${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}-${Date.now()}${safeExt}`;
      const { error: upErr } = await supabase.storage
        .from("reports")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      const res = await uploadFn({
        data: {
          month,
          year,
          day,
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
      dispatchPush({ source: "report", id: res.reportId, updated: res.merged });
      toast.success(
        lang === "ar"
          ? res.merged
            ? `تم دمج الشيت مع تقرير اليوم (${res.count} مندوب)`
            : `تم رفع التقرير بنجاح (${res.count} مندوب)`
          : res.merged
            ? `Sheet merged into the day's report (${res.count} riders)`
            : `Report uploaded successfully (${res.count} riders)`,
      );
      setFile(null);
      setNote("");
      setUploadMode("new");
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["report-sheets"] });
    } catch (err) {
      console.error("uploadReport failed", err);
      toast.error(errText(err, t("admin.toastUploadFailed")));
    } finally {
      setUploading(false);
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

  // Hides/unhides a month's report from riders looking it up — the report
  // itself (and its data) stays exactly as it is, only visibility changes.
  const handleToggleHidden = async (id: string, hidden: boolean) => {
    try {
      const { error } = await supabase.from("reports").update({ is_hidden: hidden }).eq("id", id);
      if (error) throw new Error(error.message);
      toast.success(hidden ? t("admin.toastReportHidden") : t("admin.toastReportShown"));
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastReportHideFailed")));
    }
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
      queryClient.invalidateQueries({ queryKey: ["report-sheets"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastDeleteFailed")));
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    setBulkDeleting(true);
    try {
      for (const id of ids) {
        await deleteFn({ data: { id } });
      }
      toast.success(t("admin.toastBulkDeleteSuccess"));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["report-sheets"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastDeleteFailed")));
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteSheet = async (sheetId: string) => {
    setDeletingSheetId(sheetId);
    try {
      const res = await deleteSheetFn({ data: { sheetId } });
      toast.success(
        res.deletedReport ? t("admin.toastSheetDeletedWithReport") : t("admin.toastSheetDeleted"),
      );
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["report-sheets"] });
    } catch (err) {
      toast.error(errText(err, t("admin.toastDeleteFailed")));
    } finally {
      setDeletingSheetId(null);
    }
  };

  return (
    <div className="space-y-6">
      {canWrite && (
        <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t("admin.uploadCardTitle")}
            </CardTitle>
            <CardDescription>{t("admin.uploadCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <Label>{t("admin.reportDateLabel")}</Label>
                <DateInputDMY value={uploadDate} onChange={setUploadDate} />
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
      )}

      <Card
        className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
        style={{ animationDelay: "80ms" }}
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
            <div className="space-y-4">
              {canWrite && selectedIds.size > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 px-4 py-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} {t("admin.selectedCountLabel")}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        <Trash2 className="h-4 w-4 ms-2" />
                        {t("admin.deleteSelectedButton")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.deleteSelectedConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("admin.deleteSelectedConfirmDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={bulkDeleting}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleBulkDelete([...selectedIds])}
                        >
                          {bulkDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            t("admin.delete")
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
              {monthGroups.map((group, gi) => {
                const ids = group.reports.map((r) => r.id);
                const allSelected = ids.every((id) => selectedIds.has(id));
                const collapsed = collapsedMonths.has(group.key);
                return (
                  <div
                    key={group.key}
                    className="rounded-lg border overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-[backwards]"
                    style={{ animationDelay: `${Math.min(gi * 60, 300)}ms` }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        {canWrite && (
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleSelectMonth(ids)}
                            aria-label={t("admin.selectAllInMonth")}
                          />
                        )}
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary"
                          onClick={() => toggleMonthCollapse(group.key)}
                        >
                          {collapsed ? (
                            <ChevronDown className="h-4 w-4 transition-transform" />
                          ) : (
                            <ChevronUp className="h-4 w-4 transition-transform" />
                          )}
                          {monthLabel(group.month, group.year, lang)}
                        </button>
                        <Badge variant="secondary">
                          {group.reports.length} {t("admin.daysCountLabel")}
                        </Badge>
                      </div>
                      {canWrite && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive transition-transform hover:scale-105"
                            >
                              <Trash2 className="h-4 w-4 ms-2" />
                              {t("admin.deleteMonthButton")}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("admin.deleteMonthConfirmTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("admin.deleteMonthConfirmDesc")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={bulkDeleting}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleBulkDelete(ids)}
                              >
                                {bulkDeleting ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  t("admin.delete")
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    {!collapsed && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {canWrite && <TableHead className="w-10" />}
                            <TableHead>{t("admin.tableMonth")}</TableHead>
                            <TableHead>{t("admin.tableFileName")}</TableHead>
                            <TableHead>{t("admin.tableRiderCount")}</TableHead>
                            <TableHead>{t("admin.tableUploadDate")}</TableHead>
                            <TableHead className="text-end">{t("admin.tableActions")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.reports.map((r, i) => (
                            <TableRow
                              key={r.id}
                              className="animate-in fade-in transition-colors duration-300 fill-mode-[backwards]"
                              style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                            >
                              {canWrite && (
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIds.has(r.id)}
                                    onCheckedChange={() => toggleSelect(r.id)}
                                    aria-label={reportDateLabel(r.day, r.month, r.year, lang)}
                                  />
                                </TableCell>
                              )}
                              <TableCell className="whitespace-nowrap font-medium">
                                {reportDateLabel(r.day, r.month, r.year, lang)}
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <div className="truncate">{r.file_name}</div>
                                {(sheetsByReport.get(r.id)?.length ?? 0) > 1 && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {(sheetsByReport.get(r.id)?.length ?? 0) +
                                      " " +
                                      t("admin.sheetsWord")}
                                  </span>
                                )}
                                {r.is_hidden && (
                                  <div className="mt-0.5">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-muted-foreground"
                                    >
                                      {t("admin.reportHiddenBadge")}
                                    </Badge>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{r.rider_count}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDate(r.created_at)}
                              </TableCell>
                              <TableCell className="text-end">
                                <ReportSheetsDialog
                                  title={reportDateLabel(r.day, r.month, r.year, lang)}
                                  sheets={sheetsByReport.get(r.id) ?? []}
                                  deletingSheetId={deletingSheetId}
                                  canDelete={canWrite}
                                  t={t}
                                  onDownload={handleDownload}
                                  onDelete={handleDeleteSheet}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title={t("admin.downloadTooltip")}
                                  className="transition-transform hover:scale-110"
                                  onClick={() => handleDownload(r.storage_path, r.file_name)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                {canWrite && (
                                  <NoteEditor
                                    reportId={r.id}
                                    initialNote={r.note}
                                    title={reportDateLabel(r.day, r.month, r.year, lang)}
                                    t={t}
                                    onSave={handleSaveNote}
                                  />
                                )}
                                {canWrite && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title={
                                      r.is_hidden
                                        ? t("admin.showReportTooltip")
                                        : t("admin.hideReportTooltip")
                                    }
                                    className={
                                      r.is_hidden
                                        ? "text-primary transition-transform hover:scale-110"
                                        : "transition-transform hover:scale-110"
                                    }
                                    onClick={() => handleToggleHidden(r.id, !r.is_hidden)}
                                  >
                                    {r.is_hidden ? (
                                      <Eye className="h-4 w-4" />
                                    ) : (
                                      <EyeOff className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                {canWrite && (
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
                                        <AlertDialogTitle>
                                          {t("admin.deleteReportTitle")}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {lang === "ar"
                                            ? `سيتم حذف تقرير ${reportDateLabel(r.day, r.month, r.year, lang)} وجميع بيانات المناديب المرتبطة به. لا يمكن التراجع.`
                                            : `The ${reportDateLabel(r.day, r.month, r.year, lang)} report and all associated rider data will be deleted. This cannot be undone.`}
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
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
