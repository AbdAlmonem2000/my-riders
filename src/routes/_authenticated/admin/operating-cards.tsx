import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/doc-status-badge";
import { DateInputDMY } from "@/components/date-input-dmy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AreaFilterPicker } from "@/components/area-filter-picker";
import { UserFilterPicker } from "@/components/user-filter-picker";
import { getRiderDocumentDownloadUrl } from "@/lib/documents.functions";
import {
  bulkAssignOperatingCards,
  deleteOperatingCardGroup,
  updateOperatingCardGroup,
  uploadOperatingCardFile,
} from "@/lib/operating-cards.functions";
import { checkIsAdmin } from "@/lib/reports.functions";
import {
  hasAllowedDocExtension,
  isValidExpiryDate,
  OPERATING_CARD_TYPES,
  computeDocStatus,
  type DocStatus,
  type DocType,
} from "@/lib/document-status";
import { errText } from "@/lib/error-text";
import { formatDate } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/operating-cards")({
  component: AdminOperatingCards,
});

interface RiderLite {
  id: string;
  rider_name: string | null;
  iqama_number: string | null;
  id_number: string | null;
  area: string | null;
}

interface CardDocRow {
  id: string;
  rider_id: string;
  doc_type: string;
  card_number: string | null;
  plate_number: string | null;
  expiry_date: string | null;
  storage_path: string | null;
  file_name: string | null;
}

// Both operating-card slots enforce their own 3-rider cap independently (see
// assertOperatingCardAssignment in documents.functions.ts), so the same card
// number could legitimately carry a different set of riders in each slot —
// grouped by (doc_type, card_number) together rather than by number alone.
interface CardGroup {
  key: string;
  docType: string;
  cardNumber: string;
  // Only set when every rider in the group shares the exact same file —
  // a group bulk-assigned a card number but never given a file (or one
  // uploaded per-rider before this feature existed) has no single group file.
  groupFile: { storagePath: string; fileName: string } | null;
  // One rider whose file can represent the whole group when opening/
  // downloading it — the group's own shared file when every rider matches,
  // otherwise whichever rider happens to have one (an older,
  // per-rider-uploaded card). Null when no one in the group has a file yet.
  fileRiderId: string | null;
  plateNumber: string | null;
  expiryDate: string | null;
  // "missing" here means no file yet, same as a status badge's "missing"
  // means no document at all — the fields (card number, area) can already
  // be assigned via a bulk sheet before the actual file exists.
  status: DocStatus;
  daysLeft: number | null;
  riders: {
    riderId: string;
    riderName: string;
    iqamaNumber: string | null;
    idNumber: string | null;
    idText: string;
    area: string | null;
    hasFile: boolean;
  }[];
}

const STATUS_FILTERS: { value: "all" | DocStatus; key: TranslationKey }[] = [
  { value: "all", key: "documents.filterAll" },
  { value: "expired", key: "documents.statusExpired" },
  { value: "warning", key: "documents.statusWarning" },
  { value: "ok", key: "documents.statusOk" },
  { value: "missing", key: "documents.statusMissing" },
];

function docTypeKey(dt: string): TranslationKey {
  return `documents.type.${dt}` as TranslationKey;
}

// Lets an admin add/replace the whole card group's file, plate number, and
// expiry date in one action, instead of once per rider sharing the card.
function EditCardGroupDialog({
  group,
  companyId,
  open,
  onOpenChange,
  t,
}: {
  group: CardGroup;
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const updateMetaFn = useServerFn(updateOperatingCardGroup);
  const uploadFileFn = useServerFn(uploadOperatingCardFile);
  const [plateNumber, setPlateNumber] = useState(group.plateNumber ?? "");
  const [expiryDate, setExpiryDate] = useState(group.expiryDate ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (file && !hasAllowedDocExtension(file.name)) {
      return toast.error(t("documents.toastInvalidExtension"));
    }
    // A card number can sit unfinished with no expiry (e.g. just assigned
    // via a bulk sheet), but actually uploading its file completes it —
    // from this point on it needs a real expiry date.
    if (file && (!expiryDate || !isValidExpiryDate(expiryDate))) {
      return toast.error(t("documents.toastInvalidDate"));
    }
    setSaving(true);
    try {
      await updateMetaFn({
        data: {
          docType: group.docType as "operating_card" | "operating_card_extra",
          cardNumber: group.cardNumber,
          plateNumber: plateNumber.trim() || null,
          expiryDate: expiryDate || null,
        },
      });
      if (file) {
        const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
        const safeExt = extMatch ? extMatch[0].toLowerCase() : "";
        const safeCard = group.cardNumber.replace(/[^0-9A-Za-z-]/g, "");
        const path = `${companyId}/cards/${group.docType}-${safeCard}-${Date.now()}${safeExt}`;
        const { error: upErr } = await supabase.storage
          .from("rider-documents")
          .upload(path, file, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        await uploadFileFn({
          data: {
            docType: group.docType as "operating_card" | "operating_card_extra",
            cardNumber: group.cardNumber,
            storagePath: path,
            fileName: file.name,
            expiryDate,
          },
        });
      }
      toast.success(t("operatingCards.toastGroupSaveSuccess"));
      queryClient.invalidateQueries({ queryKey: ["operating-cards-docs"] });
      queryClient.invalidateQueries({ queryKey: ["rider-documents"] });
      queryClient.invalidateQueries({ queryKey: ["rider-documents-expiring"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errText(err, t("operatingCards.toastGroupSaveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle dir="ltr">{group.cardNumber}</DialogTitle>
          <DialogDescription>{t("operatingCards.editGroupDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("documents.plateNumberLabel")}</Label>
            <Input
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              dir="ltr"
              maxLength={20}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("documents.expiryDateLabel")}</Label>
            <DateInputDMY value={expiryDate} onChange={setExpiryDate} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("documents.fileLabel")}</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {group.groupFile && !file && (
              <p className="truncate text-[11px] text-muted-foreground">
                {t("operatingCards.currentFileLabel")}: {group.groupFile.fileName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("documents.cancelButton")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface BulkRowError {
  text: string;
}

// Upload a sheet of card_number + rider Iqama (+ optional plate/expiry) and
// assign them all at once — same validation rules as a single manual
// assignment (3 riders max per card, all in the same area), checked across
// the whole sheet before anything is saved.
function BulkUploadDialog({
  open,
  onOpenChange,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const bulkFn = useServerFn(bulkAssignOperatingCards);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<"operating_card" | "operating_card_extra">(
    "operating_card",
  );
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<BulkRowError[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t("admin.toastSelectFile"));
    setUploading(true);
    setErrors(null);
    try {
      const { parseOperatingCardsExcel } = await import("@/lib/excel");
      const parsed = await parseOperatingCardsExcel(file);
      if (!parsed.iqamaColumn) throw new Error(t("operatingCards.toastNoIqamaColumn"));
      if (!parsed.cardNumberColumn) throw new Error(t("operatingCards.toastNoCardColumn"));
      if (parsed.rows.length === 0) throw new Error(t("admin.toastEmptyFile"));

      const res = await bulkFn({
        data: {
          docType,
          headers: parsed.headers,
          iqamaColumn: parsed.iqamaColumn,
          cardNumberColumn: parsed.cardNumberColumn,
          plateNumberColumn: parsed.plateNumberColumn,
          expiryDateColumn: parsed.expiryDateColumn,
          rows: parsed.rows,
        },
      });
      toast.success(t("operatingCards.toastBulkSuccess").replace("{count}", String(res.count)));
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["operating-cards-docs"] });
      queryClient.invalidateQueries({ queryKey: ["rider-documents"] });
      queryClient.invalidateQueries({ queryKey: ["rider-documents-expiring"] });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrors(message.split("\n").map((text) => ({ text })));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setErrors(null);
          setFile(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("operatingCards.bulkUploadTitle")}</DialogTitle>
          <DialogDescription>{t("operatingCards.bulkUploadDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={docType === "operating_card" ? "default" : "outline"}
              onClick={() => setDocType("operating_card")}
            >
              {t("documents.type.operating_card")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={docType === "operating_card_extra" ? "default" : "outline"}
              onClick={() => setDocType("operating_card_extra")}
            >
              {t("documents.type.operating_card_extra")}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("operatingCards.bulkFileLabel")}</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {errors && errors.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
              {errors.map((er, i) => (
                <p key={i} className="text-xs text-destructive">
                  {er.text}
                </p>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={uploading || !file}>
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("operatingCards.bulkUploadButton")
              )}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("documents.cancelButton")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminOperatingCards() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const isAdminFn = useServerFn(checkIsAdmin);
  const downloadUrlFn = useServerFn(getRiderDocumentDownloadUrl);
  const deleteGroupFn = useServerFn(deleteOperatingCardGroup);
  const [search, setSearch] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [deletingGroupKey, setDeletingGroupKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });
  const canWrite = adminCheck.data ? adminCheck.data.documentsAccess === "full" : true;
  const isStaff = !!adminCheck.data?.isStaff;
  const companyId = adminCheck.data?.companyId ?? null;

  const handleView = async (riderId: string, docType: string) => {
    try {
      const { url } = await downloadUrlFn({ data: { riderId, docType, preview: true } });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("documents.toastDownloadFailed")));
    }
  };

  const handleDownload = async (riderId: string, docType: string) => {
    try {
      const { url } = await downloadUrlFn({ data: { riderId, docType } });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("documents.toastDownloadFailed")));
    }
  };

  const ridersQuery = useQuery({
    queryKey: ["operating-cards-riders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("riders")
        .select("id, rider_name, iqama_number, id_number, area")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      return data as RiderLite[];
    },
  });

  const cardDocsQuery = useQuery({
    queryKey: ["operating-cards-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_documents")
        .select(
          "id, rider_id, doc_type, card_number, plate_number, expiry_date, storage_path, file_name",
        )
        .in("doc_type", [...OPERATING_CARD_TYPES])
        .limit(5000);
      if (error) throw error;
      return data as CardDocRow[];
    },
  });

  const isLoading = ridersQuery.isLoading || cardDocsQuery.isLoading;

  const areas = useMemo(
    () =>
      [
        ...new Set(
          (ridersQuery.data ?? []).map((r) => r.area?.trim()).filter((a): a is string => !!a),
        ),
      ].sort((a, b) => a.localeCompare(b, "ar")),
    [ridersQuery.data],
  );
  const [areaFilter, setAreaFilter] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const riderById = new Map((ridersQuery.data ?? []).map((r) => [r.id, r]));
    const byKey = new Map<string, CardGroup>();
    for (const d of cardDocsQuery.data ?? []) {
      const cardNumber = d.card_number?.trim();
      if (!cardNumber) continue;
      const key = `${d.doc_type}:${cardNumber}`;
      const rider = riderById.get(d.rider_id);
      const group = byKey.get(key) ?? {
        key,
        docType: d.doc_type,
        cardNumber,
        groupFile: null,
        fileRiderId: null,
        plateNumber: null,
        expiryDate: null,
        status: "missing" as DocStatus,
        daysLeft: null,
        riders: [],
      };
      group.plateNumber ??= d.plate_number;
      group.expiryDate ??= d.expiry_date;
      group.riders.push({
        riderId: d.rider_id,
        riderName: rider?.rider_name || "—",
        iqamaNumber: rider?.iqama_number ?? null,
        idNumber: rider?.id_number ?? null,
        idText: rider?.iqama_number || rider?.id_number || "—",
        area: rider?.area ?? null,
        hasFile: !!d.storage_path,
      });
      byKey.set(key, group);
    }
    for (const group of byKey.values()) {
      // A group's file is only shown as "the" file once every rider in it
      // points at the exact same storage object — otherwise there's no
      // single file to represent at the group level (groupFile stays null).
      const docsForGroup = (cardDocsQuery.data ?? []).filter(
        (d) => d.doc_type === group.docType && d.card_number?.trim() === group.cardNumber,
      );
      const paths = new Set(docsForGroup.map((d) => d.storage_path));
      if (paths.size === 1) {
        const only = docsForGroup[0];
        if (only.storage_path && only.file_name) {
          group.groupFile = { storagePath: only.storage_path, fileName: only.file_name };
        }
      }
      // A representative rider to open the card's file through, even when
      // the group doesn't have one single shared file (an older,
      // per-rider-uploaded card).
      group.fileRiderId = group.groupFile
        ? group.riders[0].riderId
        : (group.riders.find((r) => r.hasFile)?.riderId ?? null);
      const computed = group.fileRiderId ? computeDocStatus(group.expiryDate) : null;
      group.status = computed?.status ?? "missing";
      group.daysLeft = computed?.daysLeft ?? null;
    }
    return [...byKey.values()].sort((a, b) => a.cardNumber.localeCompare(b.cardNumber));
  }, [cardDocsQuery.data, ridersQuery.data]);

  const [statusFilter, setStatusFilter] = useState<"all" | DocStatus>("all");
  const filteredGroups = useMemo(() => {
    let result = groups;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (g) =>
          g.cardNumber.toLowerCase().includes(q) ||
          (g.plateNumber ?? "").toLowerCase().includes(q) ||
          g.riders.some(
            (r) =>
              (r.iqamaNumber ?? "").toLowerCase().includes(q) ||
              (r.idNumber ?? "").toLowerCase().includes(q),
          ),
      );
    }
    if (areaFilter.size > 0) {
      result = result.filter((g) => g.riders.some((r) => areaFilter.has(r.area?.trim() || "")));
    }
    if (statusFilter !== "all") {
      result = result.filter((g) => g.status === statusFilter);
    }
    return result;
  }, [groups, search, areaFilter, statusFilter]);

  // One row per rider (not per card) — reads like the bulk-upload sheet,
  // so it can also serve as a starting point for a re-upload. xlsx is
  // loaded on demand, same reasoning as the rider roster's own export.
  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = filteredGroups.flatMap((g) =>
      g.riders.map((r) => ({
        [t("operatingCards.tableCardNumber")]: g.cardNumber,
        [t("operatingCards.tableType")]: t(docTypeKey(g.docType as DocType)),
        [t("documents.plateNumberLabel")]: g.plateNumber ?? "",
        [t("documents.expiryDateLabel")]: g.expiryDate ?? "",
        [t("admin.riderNameLabel")]: r.riderName,
        [t("admin.tableIqama")]: r.iqamaNumber ?? "",
        [t("admin.tableIdNumber")]: r.idNumber ?? "",
        [t("admin.riderAreaLabel")]: r.area ?? "",
      })),
    );
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Operating Cards");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `operating-cards-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const editingGroup = groups.find((g) => g.key === editingGroupKey) ?? null;
  const deletingGroup = groups.find((g) => g.key === deletingGroupKey) ?? null;

  const handleDeleteGroup = async () => {
    if (!deletingGroup) return;
    try {
      await deleteGroupFn({
        data: {
          docType: deletingGroup.docType as "operating_card" | "operating_card_extra",
          cardNumber: deletingGroup.cardNumber,
        },
      });
      toast.success(t("operatingCards.toastDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["operating-cards-docs"] });
      queryClient.invalidateQueries({ queryKey: ["rider-documents"] });
      queryClient.invalidateQueries({ queryKey: ["rider-documents-expiring"] });
    } catch (err) {
      toast.error(errText(err, t("operatingCards.toastDeleteFailed")));
    } finally {
      setDeletingGroupKey(null);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t("operatingCards.pageTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("operatingCards.pageDesc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleExportExcel}>
            <FileSpreadsheet className="ms-1.5 h-3.5 w-3.5" />
            {t("operatingCards.exportButton")}
          </Button>
          {canWrite && (
            <Button type="button" size="sm" onClick={() => setBulkOpen(true)}>
              <Upload className="ms-1.5 h-3.5 w-3.5" />
              {t("operatingCards.bulkUploadButton")}
            </Button>
          )}
        </div>
      </div>

      {canWrite && <BulkUploadDialog open={bulkOpen} onOpenChange={setBulkOpen} t={t} />}
      {editingGroup && companyId && (
        <EditCardGroupDialog
          group={editingGroup}
          companyId={companyId}
          open={!!editingGroupKey}
          onOpenChange={(v) => setEditingGroupKey(v ? editingGroupKey : null)}
          t={t}
        />
      )}
      <AlertDialog open={!!deletingGroupKey} onOpenChange={(v) => !v && setDeletingGroupKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("operatingCards.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("operatingCards.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("documents.cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("documents.deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            {t("operatingCards.listTitle")}
          </CardTitle>
          <CardDescription>
            {t("operatingCards.listDesc")} ({filteredGroups.length})
          </CardDescription>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("operatingCards.searchPlaceholder")}
                dir="ltr"
                className="ps-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "all" | DocStatus)}
            >
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {t(f.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {areas.length > 0 && (
              <AreaFilterPicker
                areas={areas}
                selected={areaFilter}
                onChange={setAreaFilter}
                t={t}
              />
            )}
            {!isStaff && (
              <UserFilterPicker
                onPickAreas={(a) => setAreaFilter(a ? new Set(a) : new Set())}
                t={t}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && filteredGroups.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("operatingCards.empty")}
            </p>
          )}
          {!isLoading && filteredGroups.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[36rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableCardNumber")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableType")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("documents.plateNumberLabel")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableCount")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableStatus")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("documents.expiryDateLabel")}
                      </TableHead>
                      <TableHead className="min-w-[280px]">
                        {t("operatingCards.tableRiders")}
                      </TableHead>
                      <TableHead className="sticky end-0 z-20 w-12 bg-muted" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.map((g) => (
                      <TableRow key={g.key}>
                        <TableCell className="whitespace-nowrap font-mono text-sm" dir="ltr">
                          {g.cardNumber}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {t(docTypeKey(g.docType as DocType))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-sm" dir="ltr">
                          {g.plateNumber || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Users className="h-3 w-3" />
                            {g.riders.length}/3
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {g.fileRiderId ? (
                            <StatusBadge status={g.status} daysLeft={g.daysLeft} t={t} />
                          ) : (
                            <span className="text-xs font-medium text-amber-600">
                              {t("documents.cardPendingFile")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {g.expiryDate ? formatDate(g.expiryDate) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {g.riders.map((r) => (
                              <div key={r.riderId} className="min-w-0">
                                <span className="text-sm font-medium">{r.riderName}</span>{" "}
                                <span className="font-mono text-xs text-muted-foreground">
                                  {r.idText}
                                </span>
                                {r.area && (
                                  <span className="ms-1.5 text-xs text-muted-foreground">
                                    · {r.area}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="sticky end-0 z-10 bg-background text-end shadow-[-4px_0_6px_-4px_rgb(0_0_0/0.15)]">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" size="sm" variant="ghost">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canWrite && (
                                <DropdownMenuItem onClick={() => setEditingGroupKey(g.key)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                  {t("operatingCards.editGroupButton")}
                                </DropdownMenuItem>
                              )}
                              {g.fileRiderId && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleView(g.fileRiderId!, g.docType)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    {t("documents.viewButton")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDownload(g.fileRiderId!, g.docType)}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    {t("documents.downloadButton")}
                                  </DropdownMenuItem>
                                </>
                              )}
                              {canWrite && (
                                <DropdownMenuItem
                                  onClick={() => setDeletingGroupKey(g.key)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {t("documents.deleteButton")}
                                </DropdownMenuItem>
                              )}
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
    </div>
  );
}
