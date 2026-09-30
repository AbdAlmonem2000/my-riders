import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/doc-status-badge";
import { RiderPhoto } from "@/components/rider-photo";
import { ViewModeToggle } from "@/components/view-mode-toggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  uploadRiderDocument,
  updateRiderDocumentExpiry,
  deleteRiderDocument,
  getRiderDocumentDownloadUrl,
} from "@/lib/documents.functions";
import { checkIsAdmin } from "@/lib/reports.functions";
import {
  DOC_TYPES,
  computeDocStatus,
  docTypeNeedsExpiry,
  hasAllowedDocExtension,
  isKnownDocType,
  isOperatingCardDocType,
  isValidExpiryDate,
  isValidOperatingCardNumber,
  newCustomDocType,
  type DocType,
  type DocStatus,
} from "@/lib/document-status";
import { errText } from "@/lib/error-text";
import { formatDate } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { useViewMode } from "@/lib/use-view-mode";

export const Route = createFileRoute("/_authenticated/admin/documents")({
  component: AdminDocuments,
});

interface RiderRow {
  id: string;
  rider_name: string | null;
  iqama_number: string | null;
  id_number: string | null;
  photo_url: string | null;
  photo_rotation: number;
  area: string | null;
}

interface DocRow {
  id: string;
  rider_id: string;
  doc_type: string;
  storage_path: string;
  file_name: string;
  card_number: string | null;
  label: string | null;
  expiry_date: string | null;
  uploaded_at: string;
}

function docTypeKey(dt: DocType): TranslationKey {
  return `documents.type.${dt}` as TranslationKey;
}

type UploadFn = (
  docType: string,
  file: File,
  expiryDate: string | null,
  cardNumber: string | null,
  label?: string | null,
) => Promise<boolean>;
type UpdateExpiryFn = (
  docType: string,
  expiryDate: string,
  cardNumber: string | null,
) => Promise<boolean>;

function DocumentSlot({
  docType,
  title,
  doc,
  allCardDocs,
  linkedCardNumber,
  saving,
  canWrite,
  t,
  onUpload,
  onUpdateExpiry,
  onDelete,
  onView,
  onDownload,
}: {
  docType: string;
  title: string;
  doc: DocRow | undefined;
  allCardDocs: DocRow[];
  linkedCardNumber: string | null;
  saving: boolean;
  canWrite: boolean;
  t: (key: TranslationKey) => string;
  onUpload: UploadFn;
  onUpdateExpiry: UpdateExpiryFn;
  onDelete: (docType: string) => void;
  onView: (docType: string) => void;
  onDownload: (docType: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "upload" | "editDate">("view");
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState(doc?.expiry_date ?? "");
  const [cardNumber, setCardNumber] = useState(doc?.card_number ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const needsExpiry = docTypeNeedsExpiry(docType);
  const { status, daysLeft } = needsExpiry
    ? computeDocStatus(doc?.expiry_date ?? null)
    : { status: (doc ? "ok" : "missing") as DocStatus, daysLeft: null };

  const isOperatingCard = isOperatingCardDocType(docType);

  const cardUsage = useMemo(() => {
    const num = (isOperatingCard ? cardNumber : (doc?.card_number ?? "")).trim();
    if (!num) return 0;
    return new Set(
      allCardDocs
        .filter((d) => d.doc_type === docType && d.card_number === num)
        .map((d) => d.rider_id),
    ).size;
  }, [allCardDocs, cardNumber, doc, docType, isOperatingCard]);

  const startUpload = () => {
    setExpiryDate(doc?.expiry_date ?? "");
    setCardNumber(doc?.card_number ?? "");
    setFile(null);
    setMode("upload");
  };

  const startEditDate = () => {
    setExpiryDate(doc?.expiry_date ?? "");
    setCardNumber(doc?.card_number ?? "");
    setMode("editDate");
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t("documents.toastFileRequired"));
    if (!hasAllowedDocExtension(file.name))
      return toast.error(t("documents.toastInvalidExtension"));
    if (needsExpiry && (!expiryDate || !isValidExpiryDate(expiryDate))) {
      return toast.error(t("documents.toastInvalidDate"));
    }
    if (isOperatingCard) {
      if (!cardNumber.trim()) return toast.error(t("documents.toastCardNumberRequired"));
      if (!isValidOperatingCardNumber(cardNumber))
        return toast.error(t("documents.toastCardNumberInvalid"));
    }
    const ok = await onUpload(
      docType,
      file,
      needsExpiry ? expiryDate : null,
      isOperatingCard ? cardNumber.trim() : null,
    );
    if (ok) {
      setMode("view");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submitEditDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expiryDate || !isValidExpiryDate(expiryDate)) {
      return toast.error(t("documents.toastInvalidDate"));
    }
    if (isOperatingCard) {
      if (!cardNumber.trim()) return toast.error(t("documents.toastCardNumberRequired"));
      if (!isValidOperatingCardNumber(cardNumber))
        return toast.error(t("documents.toastCardNumberInvalid"));
    }
    const ok = await onUpdateExpiry(
      docType,
      expiryDate,
      isOperatingCard ? cardNumber.trim() : null,
    );
    if (ok) setMode("view");
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <StatusBadge status={status} daysLeft={daysLeft} t={t} />
      </div>

      {docType === "vehicle_registration" && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {linkedCardNumber
            ? `${t("documents.linkedCardLabel")} ${linkedCardNumber}`
            : t("documents.linkedCardMissing")}
        </p>
      )}

      {doc ? (
        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <div className="truncate">{doc.file_name}</div>
          {needsExpiry && (
            <div>
              {t("documents.expiryDateLabel")}: {formatDate(doc.expiry_date ?? "")}
            </div>
          )}
          <div>
            {t("documents.uploadedAtLabel")}: {formatDate(doc.uploaded_at)}
          </div>
          {isOperatingCard && doc.card_number && (
            <div>
              {t("documents.cardNumberLabel")}: {doc.card_number} — {cardUsage}{" "}
              {t("documents.cardCapacitySuffix")}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t("documents.notUploadedYet")}</p>
      )}

      {mode === "view" && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {canWrite && (
            <Button type="button" size="sm" variant="outline" onClick={startUpload}>
              <Upload className="ms-1.5 h-3.5 w-3.5" />
              {doc ? t("documents.replaceButton") : t("documents.uploadButton")}
            </Button>
          )}
          {doc && (
            <>
              {canWrite && needsExpiry && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  title={t("documents.editDateTooltip")}
                  onClick={startEditDate}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title={t("documents.viewButton")}
                onClick={() => onView(docType)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title={t("documents.downloadButton")}
                onClick={() => onDownload(docType)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              {canWrite && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title={t("documents.deleteButton")}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("documents.deleteConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("documents.deleteConfirmDesc")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("documents.cancelButton")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(docType)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("documents.deleteButton")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )}
        </div>
      )}

      {mode === "upload" && (
        <form onSubmit={submitUpload} className="mt-3 space-y-2 rounded-md bg-muted/40 p-2.5">
          <div className="space-y-1">
            <Label className="text-xs">{t("documents.fileLabel")}</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {needsExpiry && (
            <div className="space-y-1">
              <Label className="text-xs">{t("documents.expiryDateLabel")}</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
              />
            </div>
          )}
          {isOperatingCard && (
            <div className="space-y-1">
              <Label className="text-xs">{t("documents.cardNumberLabel")}</Label>
              <Input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                dir="ltr"
                maxLength={11}
                placeholder={t("documents.cardNumberPlaceholder")}
              />
              {cardNumber.trim() && (
                <p className="text-[11px] text-muted-foreground">
                  {cardUsage} {t("documents.cardCapacitySuffix")}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : doc ? (
                t("documents.replaceButton")
              ) : (
                t("documents.uploadButton")
              )}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
              {t("documents.cancelButton")}
            </Button>
          </div>
        </form>
      )}

      {mode === "editDate" && (
        <form onSubmit={submitEditDate} className="mt-3 space-y-2 rounded-md bg-muted/40 p-2.5">
          <div className="space-y-1">
            <Label className="text-xs">{t("documents.expiryDateLabel")}</Label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required
            />
          </div>
          {isOperatingCard && (
            <div className="space-y-1">
              <Label className="text-xs">{t("documents.cardNumberLabel")}</Label>
              <Input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                dir="ltr"
                maxLength={11}
                placeholder={t("documents.cardNumberPlaceholder")}
              />
              {cardNumber.trim() && (
                <p className="text-[11px] text-muted-foreground">
                  {cardUsage} {t("documents.cardCapacitySuffix")}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
              {t("documents.cancelButton")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function AddCustomDocument({
  saving,
  t,
  onUpload,
}: {
  saving: boolean;
  t: (key: TranslationKey) => string;
  onUpload: UploadFn;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return toast.error(t("documents.toastLabelRequired"));
    if (!file) return toast.error(t("documents.toastFileRequired"));
    if (!hasAllowedDocExtension(file.name))
      return toast.error(t("documents.toastInvalidExtension"));
    if (!expiryDate || !isValidExpiryDate(expiryDate)) {
      return toast.error(t("documents.toastInvalidDate"));
    }
    const ok = await onUpload(newCustomDocType(), file, expiryDate, null, label.trim());
    if (ok) {
      setOpen(false);
      setLabel("");
      setFile(null);
      setExpiryDate("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full border-dashed"
        onClick={() => setOpen(true)}
      >
        <Plus className="ms-1.5 h-3.5 w-3.5" />
        {t("documents.addCustomButton")}
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="space-y-1">
        <Label className="text-xs">{t("documents.customLabelLabel")}</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("documents.customLabelPlaceholder")}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("documents.fileLabel")}</Label>
        <Input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("documents.expiryDateLabel")}</Label>
        <Input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          required
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("documents.uploadButton")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("documents.cancelButton")}
        </Button>
      </div>
    </form>
  );
}

function RiderDocumentsDialog({
  rider,
  docs,
  allCardDocs,
  savingDocType,
  canWrite,
  t,
  onUpload,
  onUpdateExpiry,
  onDelete,
  onView,
  onDownload,
}: {
  rider: RiderRow;
  docs: DocRow[];
  allCardDocs: DocRow[];
  savingDocType: string | null;
  canWrite: boolean;
  t: (key: TranslationKey) => string;
  onUpload: UploadFn;
  onUpdateExpiry: UpdateExpiryFn;
  onDelete: (docType: string) => void;
  onView: (docType: string) => void;
  onDownload: (docType: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const docsByType = useMemo(() => {
    const m = new Map<string, DocRow>();
    for (const d of docs) m.set(d.doc_type, d);
    return m;
  }, [docs]);
  const customDocs = useMemo(
    () =>
      docs
        .filter((d) => !isKnownDocType(d.doc_type))
        .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)),
    [docs],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <FileText className="ms-1.5 h-4 w-4" />
          {t("documents.manageButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rider.rider_name || rider.iqama_number || rider.id_number || "—"}
          </DialogTitle>
          <DialogDescription>{t("documents.dialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {DOC_TYPES.map((dt) => (
            <DocumentSlot
              key={dt}
              docType={dt}
              title={t(docTypeKey(dt))}
              doc={docsByType.get(dt)}
              allCardDocs={allCardDocs}
              linkedCardNumber={docsByType.get("operating_card")?.card_number ?? null}
              saving={savingDocType === dt}
              canWrite={canWrite}
              t={t}
              onUpload={onUpload}
              onUpdateExpiry={onUpdateExpiry}
              onDelete={onDelete}
              onView={onView}
              onDownload={onDownload}
            />
          ))}

          {customDocs.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground">
                {t("documents.customSectionTitle")}
              </div>
              {customDocs.map((d) => (
                <DocumentSlot
                  key={d.doc_type}
                  docType={d.doc_type}
                  title={d.label || d.doc_type}
                  doc={d}
                  allCardDocs={allCardDocs}
                  linkedCardNumber={null}
                  saving={savingDocType === d.doc_type}
                  canWrite={canWrite}
                  t={t}
                  onUpload={onUpload}
                  onUpdateExpiry={onUpdateExpiry}
                  onDelete={onDelete}
                  onView={onView}
                  onDownload={onDownload}
                />
              ))}
            </div>
          )}

          {canWrite && (
            <AddCustomDocument saving={savingDocType === "new-custom"} t={t} onUpload={onUpload} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_FILTERS: { value: "all" | DocStatus; key: TranslationKey }[] = [
  { value: "all", key: "documents.filterAll" },
  { value: "expired", key: "documents.statusExpired" },
  { value: "warning", key: "documents.statusWarning" },
  { value: "ok", key: "documents.statusOk" },
  { value: "missing", key: "documents.statusMissing" },
];

function AdminDocuments() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const uploadDocFn = useServerFn(uploadRiderDocument);
  const updateExpiryFn = useServerFn(updateRiderDocumentExpiry);
  const deleteDocFn = useServerFn(deleteRiderDocument);
  const downloadUrlFn = useServerFn(getRiderDocumentDownloadUrl);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });
  // View-only (and 'none', though that tier can't reach this page at all —
  // see route.tsx) staff can browse and download but never upload/edit/
  // delete — enforced again server-side (and at the storage/RLS layer),
  // this just keeps the UI from offering actions that would be rejected.
  const canWrite = adminCheck.data ? adminCheck.data.documentsAccess === "full" : true;
  const canRotatePhotos = adminCheck.data?.ridersAccess === "full";

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
      return data as RiderRow[];
    },
  });

  const docsQuery = useQuery({
    queryKey: ["rider-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_documents")
        .select(
          "id, rider_id, doc_type, storage_path, file_name, card_number, label, expiry_date, uploaded_at",
        )
        .limit(5000);
      if (error) throw error;
      return data as DocRow[];
    },
  });

  const docsByRider = useMemo(() => {
    const m = new Map<string, DocRow[]>();
    for (const d of docsQuery.data ?? []) {
      const arr = m.get(d.rider_id) ?? [];
      arr.push(d);
      m.set(d.rider_id, arr);
    }
    return m;
  }, [docsQuery.data]);

  const allCardDocs = useMemo(
    () => (docsQuery.data ?? []).filter((d) => isOperatingCardDocType(d.doc_type)),
    [docsQuery.data],
  );

  // Every operating card number a rider holds (both slots), so the search
  // box can find a rider by their card number too, not just name/ID.
  const cardNumbersByRider = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of allCardDocs) {
      if (!d.card_number) continue;
      const arr = m.get(d.rider_id) ?? [];
      arr.push(d.card_number);
      m.set(d.rider_id, arr);
    }
    return m;
  }, [allCardDocs]);

  const riderStatusCounts = useMemo(() => {
    const m = new Map<string, Record<DocStatus, number>>();
    for (const r of ridersQuery.data ?? []) {
      const riderDocs = docsByRider.get(r.id) ?? [];
      const byType = new Map(riderDocs.map((d) => [d.doc_type, d]));
      const counts: Record<DocStatus, number> = { ok: 0, warning: 0, expired: 0, missing: 0 };
      for (const dt of DOC_TYPES) {
        counts[computeDocStatus(byType.get(dt)?.expiry_date ?? null).status]++;
      }
      for (const d of riderDocs) {
        if (isKnownDocType(d.doc_type)) continue;
        counts[computeDocStatus(d.expiry_date).status]++;
      }
      m.set(r.id, counts);
    }
    return m;
  }, [ridersQuery.data, docsByRider]);

  const areas = useMemo(
    () =>
      [
        ...new Set(
          (ridersQuery.data ?? []).map((r) => r.area?.trim()).filter((a): a is string => !!a),
        ),
      ].sort((a, b) => a.localeCompare(b, "ar")),
    [ridersQuery.data],
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DocStatus>("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const filteredRiders = useMemo(() => {
    const rows = ridersQuery.data ?? [];
    const q = search.trim().toLowerCase();
    let result = rows;
    if (q) {
      result = result.filter((r) =>
        [
          r.rider_name,
          r.iqama_number,
          r.id_number,
          r.area,
          ...(cardNumbersByRider.get(r.id) ?? []),
        ].some((v) => (v ?? "").toLowerCase().includes(q)),
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((r) => (riderStatusCounts.get(r.id)?.[statusFilter] ?? 0) > 0);
    }
    if (areaFilter !== "all") {
      result = result.filter((r) => (r.area?.trim() || "") === areaFilter);
    }
    return result;
  }, [ridersQuery.data, search, statusFilter, areaFilter, riderStatusCounts, cardNumbersByRider]);

  const [savingRiderId, setSavingRiderId] = useState<string | null>(null);
  const [savingDocType, setSavingDocType] = useState<string | null>(null);

  const [viewMode, setViewMode] = useViewMode("documents-view-mode");

  const handleUpload = async (
    riderId: string,
    docType: string,
    file: File,
    expiryDate: string | null,
    cardNumber: string | null,
    label?: string | null,
  ) => {
    setSavingRiderId(riderId);
    setSavingDocType(docType.startsWith("custom:") ? "new-custom" : docType);
    try {
      const companyId = adminCheck.data?.companyId ?? "shared";
      const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
      const safeExt = extMatch ? extMatch[0].toLowerCase() : "";
      const path = `${companyId}/${riderId}/${docType}-${Date.now()}${safeExt}`;
      const { error: upErr } = await supabase.storage
        .from("rider-documents")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      await uploadDocFn({
        data: {
          riderId,
          docType,
          storagePath: path,
          fileName: file.name,
          expiryDate,
          cardNumber,
          label: label ?? null,
        },
      });
      toast.success(t("documents.toastUploadSuccess"));
      queryClient.invalidateQueries({ queryKey: ["rider-documents"] });
      return true;
    } catch (err) {
      console.error("uploadRiderDocument failed", err);
      toast.error(errText(err, t("documents.toastUploadFailed")));
      return false;
    } finally {
      setSavingRiderId(null);
      setSavingDocType(null);
    }
  };

  const handleUpdateExpiry = async (
    riderId: string,
    docType: string,
    expiryDate: string,
    cardNumber: string | null,
  ) => {
    setSavingRiderId(riderId);
    setSavingDocType(docType);
    try {
      await updateExpiryFn({ data: { riderId, docType, expiryDate, cardNumber } });
      toast.success(t("documents.toastExpiryUpdateSuccess"));
      queryClient.invalidateQueries({ queryKey: ["rider-documents"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("documents.toastExpiryUpdateFailed")));
      return false;
    } finally {
      setSavingRiderId(null);
      setSavingDocType(null);
    }
  };

  const handleDelete = async (riderId: string, docType: string) => {
    try {
      await deleteDocFn({ data: { riderId, docType } });
      toast.success(t("documents.toastDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["rider-documents"] });
    } catch (err) {
      toast.error(errText(err, t("documents.toastDeleteFailed")));
    }
  };

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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t("documents.pageTitle")}</CardTitle>
            <CardDescription>{t("documents.pageDesc")}</CardDescription>
            {!canWrite && (
              <p className="mt-1 text-xs font-medium text-amber-600">
                {t("documents.viewOnlyNote")}
              </p>
            )}
          </div>
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </CardHeader>
        <CardContent>
          {ridersQuery.isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {ridersQuery.data && ridersQuery.data.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("documents.noRiders")}
            </p>
          )}
          {ridersQuery.data && ridersQuery.data.length > 0 && (
            <>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("documents.searchPlaceholder")}
                    className="pe-9"
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
                  <Select value={areaFilter} onValueChange={setAreaFilter}>
                    <SelectTrigger className="sm:w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("admin.filterAllAreas")}</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {filteredRiders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("documents.searchNoResults")}
                </p>
              ) : viewMode === "table" ? (
                <div className="overflow-hidden rounded-xl border">
                  <div className="max-h-120 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="min-w-45">{t("documents.tableRider")}</TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("documents.tableArea")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("documents.tableStatus")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-end">
                            {t("documents.tableActions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRiders.map((r) => {
                          const counts = riderStatusCounts.get(r.id) ?? {
                            ok: 0,
                            warning: 0,
                            expired: 0,
                            missing: 0,
                          };
                          return (
                            <TableRow key={r.id}>
                              <TableCell>
                                <div className="flex items-center gap-2.5">
                                  {r.photo_url ? (
                                    <RiderPhoto
                                      riderId={r.id}
                                      src={r.photo_url}
                                      alt={r.rider_name ?? ""}
                                      rotation={r.photo_rotation}
                                      canRotate={canRotatePhotos}
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
                                    <div className="truncate font-mono text-xs text-muted-foreground">
                                      {r.iqama_number || r.id_number || "—"}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {r.area || "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2.5 text-xs">
                                  {counts.expired > 0 && (
                                    <span className="flex items-center gap-1 font-medium text-red-600">
                                      <XCircle className="h-3.5 w-3.5" />
                                      {counts.expired}
                                    </span>
                                  )}
                                  {counts.warning > 0 && (
                                    <span className="flex items-center gap-1 font-medium text-amber-600">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      {counts.warning}
                                    </span>
                                  )}
                                  {counts.ok > 0 && (
                                    <span className="flex items-center gap-1 font-medium text-emerald-600">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      {counts.ok}
                                    </span>
                                  )}
                                  {counts.missing > 0 && (
                                    <span className="text-muted-foreground">
                                      {counts.missing}/{DOC_TYPES.length}{" "}
                                      <Clock className="inline h-3 w-3" />
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-end">
                                <RiderDocumentsDialog
                                  rider={r}
                                  docs={docsByRider.get(r.id) ?? []}
                                  allCardDocs={allCardDocs}
                                  savingDocType={savingRiderId === r.id ? savingDocType : null}
                                  canWrite={canWrite}
                                  t={t}
                                  onUpload={(docType, file, expiryDate, cardNumber, label) =>
                                    handleUpload(r.id, docType, file, expiryDate, cardNumber, label)
                                  }
                                  onUpdateExpiry={(docType, expiryDate, cardNumber) =>
                                    handleUpdateExpiry(r.id, docType, expiryDate, cardNumber)
                                  }
                                  onDelete={(docType) => handleDelete(r.id, docType)}
                                  onView={(docType) => handleView(r.id, docType)}
                                  onDownload={(docType) => handleDownload(r.id, docType)}
                                />
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
                    const counts = riderStatusCounts.get(r.id) ?? {
                      ok: 0,
                      warning: 0,
                      expired: 0,
                      missing: 0,
                    };
                    return (
                      <div
                        key={r.id}
                        className="animate-in fade-in flex flex-col items-center rounded-xl border bg-card p-5 text-center duration-300 fill-mode-[backwards]"
                        style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                      >
                        {r.photo_url ? (
                          <RiderPhoto
                            riderId={r.id}
                            src={r.photo_url}
                            alt={r.rider_name ?? ""}
                            rotation={r.photo_rotation}
                            canRotate={canRotatePhotos}
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
                          {r.id_number && (
                            <div
                              className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              ID: {r.id_number}
                            </div>
                          )}
                          {r.iqama_number && (
                            <div
                              className="truncate font-mono text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              {t("documents.iqamaLabel")}: {r.iqama_number}
                            </div>
                          )}
                          {r.area && (
                            <div className="mt-1 text-xs text-muted-foreground">{r.area}</div>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
                          {counts.expired > 0 && (
                            <span className="flex items-center gap-1 font-medium text-red-600">
                              <XCircle className="h-3.5 w-3.5" />
                              {counts.expired}
                            </span>
                          )}
                          {counts.warning > 0 && (
                            <span className="flex items-center gap-1 font-medium text-amber-600">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {counts.warning}
                            </span>
                          )}
                          {counts.ok > 0 && (
                            <span className="flex items-center gap-1 font-medium text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {counts.ok}
                            </span>
                          )}
                          {counts.missing > 0 && (
                            <span className="text-muted-foreground">
                              {counts.missing}/{DOC_TYPES.length}{" "}
                              <Clock className="inline h-3 w-3" />
                            </span>
                          )}
                        </div>

                        <div className="mt-4 w-full">
                          <RiderDocumentsDialog
                            rider={r}
                            docs={docsByRider.get(r.id) ?? []}
                            allCardDocs={allCardDocs}
                            savingDocType={savingRiderId === r.id ? savingDocType : null}
                            canWrite={canWrite}
                            t={t}
                            onUpload={(docType, file, expiryDate, cardNumber, label) =>
                              handleUpload(r.id, docType, file, expiryDate, cardNumber, label)
                            }
                            onUpdateExpiry={(docType, expiryDate, cardNumber) =>
                              handleUpdateExpiry(r.id, docType, expiryDate, cardNumber)
                            }
                            onDelete={(docType) => handleDelete(r.id, docType)}
                            onView={(docType) => handleView(r.id, docType)}
                            onDownload={(docType) => handleDownload(r.id, docType)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
