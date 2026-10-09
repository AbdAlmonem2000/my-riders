import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  Eye,
  FileWarning,
  Loader2,
  MoreVertical,
  Pencil,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/doc-status-badge";
import { DateInputDMY } from "@/components/date-input-dmy";
import { AreaFilterPicker } from "@/components/area-filter-picker";
import { UserFilterPicker } from "@/components/user-filter-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  getRiderDocumentDownloadUrl,
  updateRiderDocumentExpiry,
  uploadRiderDocument,
} from "@/lib/documents.functions";
import { updateOperatingCardGroup, uploadOperatingCardFile } from "@/lib/operating-cards.functions";
import { checkIsAdmin } from "@/lib/reports.functions";
import {
  computeDocStatus,
  docTypeNeedsExpiry,
  hasAllowedDocExtension,
  isCustomDocType,
  isOperatingCardDocType,
  isValidExpiryDate,
  type DocStatus,
} from "@/lib/document-status";
import { errText } from "@/lib/error-text";
import { formatDate } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { fetchAllRows } from "@/lib/supabase-paginate";

export const Route = createFileRoute("/_authenticated/admin/expiry-alerts")({
  component: AdminExpiryAlerts,
});

interface RiderLite {
  id: string;
  rider_name: string | null;
  iqama_number: string | null;
  id_number: string | null;
  area: string | null;
}

interface DocRow {
  id: string;
  rider_id: string;
  doc_type: string;
  expiry_date: string | null;
  label: string | null;
  storage_path: string | null;
  file_name: string | null;
  card_number: string | null;
  plate_number: string | null;
}

interface AlertItem {
  id: string;
  riderId: string;
  docType: string;
  typeLabel: string;
  expiryDate: string | null;
  status: DocStatus;
  daysLeft: number | null;
  hasFile: boolean;
  fileName: string | null;
  isCard: boolean;
  cardNumber: string | null;
  plateNumber: string | null;
  riderName: string;
  iqamaNumber: string | null;
  idNumber: string | null;
  area: string | null;
}

const STATUS_FILTERS: { value: "all" | DocStatus; key: TranslationKey }[] = [
  { value: "all", key: "documents.filterAll" },
  { value: "expired", key: "documents.statusExpired" },
  { value: "warning", key: "documents.statusWarning" },
  { value: "ok", key: "documents.statusOk" },
];

function docTypeKey(dt: string): TranslationKey {
  return `documents.type.${dt}` as TranslationKey;
}

// Same multi-select pattern as AreaFilterPicker, just over the doc types
// actually present in the data (including admin-named custom documents)
// instead of a fixed list, so it never shows a type the company doesn't use.
function DocTypeFilterPicker({
  options,
  selected,
  onChange,
  t,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };
  const label =
    selected.size === 0
      ? t("expiryAlerts.filterAllTypes")
      : selected.size === 1
        ? (options.find((o) => o.value === [...selected][0])?.label ?? "")
        : t("expiryAlerts.filterTypesCount").replace("{count}", String(selected.size));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between sm:w-56"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
          <Checkbox checked={selected.size === 0} onCheckedChange={() => onChange(new Set())} />
          {t("expiryAlerts.filterAllTypes")}
        </label>
        <div className="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Renews a document straight from this page — upload the new file and set
// its new expiry date, exactly what prompted opening this dialog in the
// first place. The file is optional (a plain expiry bump with no new file is
// still useful), but when it's a shared operating card this goes through
// uploadOperatingCardFile/updateOperatingCardGroup instead of the per-rider
// document functions, so every other rider sharing the same card number
// picks up the exact same renewed file and date — not just this one row.
function RenewDocumentDialog({
  item,
  companyId,
  open,
  onOpenChange,
  t,
}: {
  item: AlertItem;
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const uploadDocFn = useServerFn(uploadRiderDocument);
  const updateExpiryFn = useServerFn(updateRiderDocumentExpiry);
  const uploadCardFileFn = useServerFn(uploadOperatingCardFile);
  const updateCardMetaFn = useServerFn(updateOperatingCardGroup);
  const [expiryDate, setExpiryDate] = useState(item.expiryDate ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["expiry-alerts-docs"] });
    queryClient.invalidateQueries({ queryKey: ["rider-documents"] });
    queryClient.invalidateQueries({ queryKey: ["rider-documents-expiring"] });
    queryClient.invalidateQueries({ queryKey: ["operating-cards-docs"] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (file && !hasAllowedDocExtension(file.name)) {
      return toast.error(t("documents.toastInvalidExtension"));
    }
    if (!expiryDate || !isValidExpiryDate(expiryDate)) {
      return toast.error(t("documents.toastInvalidDate"));
    }
    setSaving(true);
    try {
      let storagePath: string | null = null;
      if (file) {
        const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
        const safeExt = extMatch ? extMatch[0].toLowerCase() : "";
        const path = item.isCard
          ? `${companyId}/cards/${item.docType}-${(item.cardNumber ?? "").replace(/[^0-9A-Za-z-]/g, "")}-${Date.now()}${safeExt}`
          : `${companyId}/${item.riderId}/${item.docType}-${Date.now()}${safeExt}`;
        const { error: upErr } = await supabase.storage
          .from("rider-documents")
          .upload(path, file, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        storagePath = path;
      }

      if (item.isCard && item.cardNumber) {
        const docType = item.docType as "operating_card" | "operating_card_extra";
        if (storagePath && file) {
          await uploadCardFileFn({
            data: {
              docType,
              cardNumber: item.cardNumber,
              storagePath,
              fileName: file.name,
              expiryDate,
            },
          });
        } else {
          await updateCardMetaFn({
            data: {
              docType,
              cardNumber: item.cardNumber,
              plateNumber: item.plateNumber,
              expiryDate,
            },
          });
        }
      } else if (storagePath && file) {
        await uploadDocFn({
          data: {
            riderId: item.riderId,
            docType: item.docType,
            storagePath,
            fileName: file.name,
            expiryDate,
            cardNumber: null,
          },
        });
      } else {
        await updateExpiryFn({
          data: {
            riderId: item.riderId,
            docType: item.docType,
            expiryDate,
            cardNumber: null,
          },
        });
      }

      toast.success(t("expiryAlerts.toastRenewSuccess"));
      invalidateAll();
      onOpenChange(false);
    } catch (err) {
      toast.error(errText(err, t("expiryAlerts.toastRenewFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item.riderName} — {item.typeLabel}
          </DialogTitle>
          <DialogDescription>
            {item.isCard ? t("expiryAlerts.renewCardDesc") : t("expiryAlerts.renewDocDesc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
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
            {item.fileName && !file && (
              <p className="truncate text-[11px] text-muted-foreground">
                {t("operatingCards.currentFileLabel")}: {item.fileName}
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

// A full management view over every rider document that actually carries an
// expiry date (so, unlike the Documents page, never-uploaded/never-expiring
// slots don't show up here at all) — the bell in the top bar is just a quick
// peek at the same data; this page is where an admin actually drills into
// "what's expired and whose", filtering by document type/area/status/user.
function AdminExpiryAlerts() {
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const downloadUrlFn = useServerFn(getRiderDocumentDownloadUrl);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DocStatus>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<Set<string>>(new Set());
  const [areaFilter, setAreaFilter] = useState<Set<string>>(new Set());

  const adminCheck = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn() });
  const isStaff = !!adminCheck.data?.isStaff;
  const canWrite = adminCheck.data ? adminCheck.data.documentsAccess === "full" : false;
  const companyId = adminCheck.data?.companyId ?? null;
  const [renewingItemId, setRenewingItemId] = useState<string | null>(null);

  const ridersQuery = useQuery({
    queryKey: ["expiry-alerts-full-riders"],
    queryFn: () =>
      // A flat .limit() here silently dropped every rider past PostgREST's
      // default row cap once the roster grew past it — see the same fix on
      // the Riders/Documents pages.
      fetchAllRows<RiderLite>(({ from, to }) =>
        supabase
          .from("riders")
          .select("id, rider_name, iqama_number, id_number, area")
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      ),
  });

  const docsQuery = useQuery({
    queryKey: ["expiry-alerts-docs"],
    queryFn: () =>
      // Same silent-truncation risk — a large roster with full document
      // sets could reach a cap and leave whole riders missing from the
      // expiry list.
      fetchAllRows<DocRow>(({ from, to }) =>
        supabase
          .from("rider_documents")
          .select(
            "id, rider_id, doc_type, expiry_date, label, storage_path, file_name, card_number, plate_number",
          )
          .not("expiry_date", "is", null)
          .order("id", { ascending: true })
          .range(from, to),
      ),
  });

  const isLoading = ridersQuery.isLoading || docsQuery.isLoading;

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

  const items = useMemo(() => {
    const riderById = new Map((ridersQuery.data ?? []).map((r) => [r.id, r]));
    return (docsQuery.data ?? [])
      .filter((d) => docTypeNeedsExpiry(d.doc_type))
      .map((d) => {
        const rider = riderById.get(d.rider_id);
        const { status, daysLeft } = computeDocStatus(d.expiry_date);
        const typeLabel = isCustomDocType(d.doc_type) ? d.label || "—" : t(docTypeKey(d.doc_type));
        const cardNumber = d.card_number?.trim() || null;
        return {
          id: d.id,
          riderId: d.rider_id,
          docType: d.doc_type,
          typeLabel,
          expiryDate: d.expiry_date,
          status,
          daysLeft,
          hasFile: !!d.storage_path,
          fileName: d.file_name,
          isCard: isOperatingCardDocType(d.doc_type) && !!cardNumber,
          cardNumber,
          plateNumber: d.plate_number,
          riderName: rider?.rider_name || "—",
          iqamaNumber: rider?.iqama_number ?? null,
          idNumber: rider?.id_number ?? null,
          area: rider?.area ?? null,
        };
      });
  }, [docsQuery.data, ridersQuery.data, t]);

  const docTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) map.set(it.docType, it.typeLabel);
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [items]);

  const areas = useMemo(
    () =>
      [
        ...new Set(
          (ridersQuery.data ?? []).map((r) => r.area?.trim()).filter((a): a is string => !!a),
        ),
      ].sort((a, b) => a.localeCompare(b, "ar")),
    [ridersQuery.data],
  );

  const filtered = useMemo(() => {
    let result = items;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (it) =>
          it.riderName.toLowerCase().includes(q) ||
          (it.iqamaNumber ?? "").toLowerCase().includes(q) ||
          (it.idNumber ?? "").toLowerCase().includes(q),
      );
    }
    if (areaFilter.size > 0) {
      result = result.filter((it) => areaFilter.has(it.area?.trim() || ""));
    }
    if (docTypeFilter.size > 0) {
      result = result.filter((it) => docTypeFilter.has(it.docType));
    }
    if (statusFilter !== "all") {
      result = result.filter((it) => it.status === statusFilter);
    }
    return [...result].sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  }, [items, search, areaFilter, docTypeFilter, statusFilter]);

  const renewingItem = items.find((it) => it.id === renewingItemId) ?? null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
      <div>
        <h2 className="text-2xl font-bold">{t("expiryAlerts.pageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("expiryAlerts.pageDesc")}</p>
      </div>

      {renewingItem && companyId && (
        <RenewDocumentDialog
          item={renewingItem}
          companyId={companyId}
          open={!!renewingItemId}
          onOpenChange={(v) => setRenewingItemId(v ? renewingItemId : null)}
          t={t}
        />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarning className="h-4 w-4" />
            {t("expiryAlerts.listTitle")}
          </CardTitle>
          <CardDescription>
            {t("expiryAlerts.listDesc")} ({filtered.length})
          </CardDescription>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
            <div className="relative flex-1 sm:min-w-[200px]">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("expiryAlerts.searchPlaceholder")}
                className="ps-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "all" | DocStatus)}
            >
              <SelectTrigger className="sm:w-48">
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
            {docTypeOptions.length > 0 && (
              <DocTypeFilterPicker
                options={docTypeOptions}
                selected={docTypeFilter}
                onChange={setDocTypeFilter}
                t={t}
              />
            )}
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
          {!isLoading && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("expiryAlerts.empty")}
            </p>
          )}
          {!isLoading && filtered.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[36rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-nowrap">
                        {t("admin.riderNameLabel")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">{t("admin.tableIqama")}</TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("admin.riderAreaLabel")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("expiryAlerts.tableDocType")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableStatus")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("documents.expiryDateLabel")}
                      </TableHead>
                      <TableHead className="sticky end-0 z-20 w-12 bg-muted" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="whitespace-nowrap text-sm font-medium">
                          {it.riderName}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap font-mono text-xs text-muted-foreground"
                          dir="ltr"
                        >
                          {it.iqamaNumber || it.idNumber || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {it.area || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{it.typeLabel}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={it.status} daysLeft={it.daysLeft} t={t} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {it.expiryDate ? formatDate(it.expiryDate) : "—"}
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
                                <DropdownMenuItem onClick={() => setRenewingItemId(it.id)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                  {t("expiryAlerts.renewButton")}
                                </DropdownMenuItem>
                              )}
                              {it.hasFile && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleView(it.riderId, it.docType)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    {t("documents.viewButton")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDownload(it.riderId, it.docType)}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    {t("documents.downloadButton")}
                                  </DropdownMenuItem>
                                </>
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
