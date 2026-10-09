import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  FileSignature,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RiderPhoto } from "@/components/rider-photo";
import { DateInputDMY } from "@/components/date-input-dmy";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { LetterDocument, useLetterPrint } from "@/components/letter-document";
import { checkIsAdmin } from "@/lib/reports.functions";
import {
  createLetter,
  updateLetter,
  sendLetterToRider,
  deleteLetter,
} from "@/lib/company-letters.functions";
import { isValidExpiryDate } from "@/lib/document-status";
import { formatDate } from "@/lib/date-format";
import { errText } from "@/lib/error-text";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { usePushDispatch } from "@/lib/push-client";
import { fetchAllRows } from "@/lib/supabase-paginate";

export const Route = createFileRoute("/_authenticated/admin/letters")({
  component: AdminLetters,
});

interface RiderRow {
  id: string;
  rider_name: string | null;
  iqama_number: string | null;
  id_number: string | null;
  photo_url: string | null;
  photo_rotation: number;
  extra: unknown;
}

interface LetterRow {
  id: string;
  rider_id: string | null;
  title: string;
  body: string;
  letter_date: string;
  include_stamp: boolean;
  include_signature: boolean;
  is_sent: boolean;
  created_at: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function riderExtra(extra: unknown): Record<string, unknown> {
  return extra && typeof extra === "object" && !Array.isArray(extra)
    ? (extra as Record<string, unknown>)
    : {};
}

function RiderPicker({
  riders,
  selectedRider,
  onSelect,
  onClear,
  canRotatePhotos,
  t,
}: {
  riders: RiderRow[];
  selectedRider: RiderRow | null;
  onSelect: (rider: RiderRow) => void;
  onClear: () => void;
  canRotatePhotos: boolean;
  t: (key: TranslationKey) => string;
}) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return riders
      .filter((r) =>
        [r.rider_name, r.iqama_number, r.id_number].some((v) =>
          (v ?? "").toLowerCase().includes(q),
        ),
      )
      .slice(0, 20);
  }, [riders, search]);

  if (selectedRider) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {selectedRider.photo_url ? (
            <RiderPhoto
              riderId={selectedRider.id}
              src={selectedRider.photo_url}
              alt={selectedRider.rider_name ?? ""}
              rotation={selectedRider.photo_rotation}
              canRotate={canRotatePhotos}
              className="h-8 w-8 shrink-0 rounded-full border border-border"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{selectedRider.rider_name || "—"}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {selectedRider.iqama_number || selectedRider.id_number || "—"}
            </div>
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("notifications.searchRiderPlaceholder")}
      />
      {search.trim() && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("notifications.searchNoResults")}
            </p>
          ) : (
            matches.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelect(r);
                  setSearch("");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm hover:bg-accent"
              >
                {r.photo_url ? (
                  <img
                    src={r.photo_url}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.rider_name || "—"}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {r.iqama_number || r.id_number || "—"}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function InsertRiderFields({
  rider,
  t,
  onInsert,
}: {
  rider: RiderRow;
  t: (key: TranslationKey) => string;
  onInsert: (value: string) => void;
}) {
  const fields: { label: string; value: string }[] = [];
  if (rider.rider_name) fields.push({ label: t("letters.fieldName"), value: rider.rider_name });
  if (rider.iqama_number) {
    fields.push({ label: t("letters.fieldIqama"), value: rider.iqama_number });
  }
  if (rider.id_number) fields.push({ label: t("letters.fieldId"), value: rider.id_number });
  for (const [k, v] of Object.entries(riderExtra(rider.extra))) {
    if (v === null || v === undefined || v === "") continue;
    fields.push({ label: k, value: String(v) });
  }
  if (fields.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("letters.insertFieldsLabel")}</Label>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <Button
            key={f.label}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onInsert(f.value)}
          >
            <Plus className="me-1 h-3 w-3" />
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function LetterViewDialog({
  letter,
  companyName,
  companyLogoUrl,
  companyStampUrl,
  companySignatureUrl,
  companyUnifiedNumber,
  companyCommercialRegistration,
  t,
  open,
  onOpenChange,
}: {
  letter: LetterRow;
  companyName: string;
  companyLogoUrl: string | null;
  companyStampUrl: string | null;
  companySignatureUrl: string | null;
  companyUnifiedNumber: string | null;
  companyCommercialRegistration: string | null;
  t: (key: TranslationKey) => string;
  // Opened from the row's "⋮" menu, not its own trigger button — one
  // instance is shared across every row instead of mounting one per letter.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const letterNode = (
    <LetterDocument
      t={t}
      assets={{
        companyName,
        companyLogoUrl,
        companyStampUrl,
        companySignatureUrl,
        companyUnifiedNumber,
        companyCommercialRegistration,
        includeStamp: letter.include_stamp,
        includeSignature: letter.include_signature,
      }}
      content={{
        title: letter.title,
        body: letter.body,
        letterDate: letter.letter_date,
      }}
    />
  );
  const { portal, print } = useLetterPrint(letterNode);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{letter.title}</DialogTitle>
        </DialogHeader>
        {letterNode}
        {portal}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button type="button" onClick={print}>
            <Printer className="ms-1.5 h-4 w-4" />
            {t("letters.printButton")}
          </Button>
          <Button type="button" variant="outline" onClick={print}>
            {t("letters.downloadPdfButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminLetters() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const createFn = useServerFn(createLetter);
  const updateFn = useServerFn(updateLetter);
  const sendToRiderFn = useServerFn(sendLetterToRider);
  const dispatchPush = usePushDispatch();
  const deleteFn = useServerFn(deleteLetter);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });
  // View-only staff can browse saved letters and view/print/download them,
  // but never compose, edit, send, or delete one — enforced again
  // server-side (and at the RLS layer), this just keeps the UI from
  // offering actions that would be rejected.
  const canWrite = adminCheck.data ? adminCheck.data.lettersAccess === "full" : true;

  const companyQuery = useQuery({
    queryKey: ["company-profile", adminCheck.data?.companyId],
    enabled: !!adminCheck.data?.companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("name, logo_url, stamp_url, signature_url, unified_number, commercial_registration")
        .eq("id", adminCheck.data!.companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ridersQuery = useQuery({
    queryKey: ["company-riders"],
    queryFn: () =>
      // A flat .limit() here silently dropped every rider past PostgREST's
      // default row cap once the roster grew past it — see the same fix on
      // the Riders/Documents pages.
      fetchAllRows<RiderRow>(({ from, to }) =>
        supabase
          .from("riders")
          .select("id, iqama_number, id_number, rider_name, photo_url, photo_rotation, extra")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
  });
  const riderById = useMemo(
    () => new Map((ridersQuery.data ?? []).map((r) => [r.id, r])),
    [ridersQuery.data],
  );

  const lettersQuery = useQuery({
    queryKey: ["company-letters"],
    queryFn: () =>
      // No explicit cap here at all, so it relied purely on PostgREST's own
      // default row limit — fine while a company has few letters, silently
      // incomplete once it genuinely doesn't.
      fetchAllRows<LetterRow>(({ from, to }) =>
        supabase
          .from("company_letters")
          .select(
            "id, rider_id, title, body, letter_date, include_stamp, include_signature, is_sent, created_at",
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
  });

  const [savedSearch, setSavedSearch] = useState("");
  const filteredLetters = useMemo(() => {
    const rows = lettersQuery.data ?? [];
    const q = savedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((l) => {
      const rider = l.rider_id ? riderById.get(l.rider_id) : null;
      return [l.title, l.body, rider?.rider_name].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [lettersQuery.data, savedSearch, riderById]);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [selectedRider, setSelectedRider] = useState<RiderRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [letterDate, setLetterDate] = useState(todayIso());
  const [includeStamp, setIncludeStamp] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(false);
  const [savedLetterId, setSavedLetterId] = useState<string | null>(null);
  // Sticky across edits (unlike savedLetterId, which clears on every field
  // change): set once we're editing an existing letter, so subsequent saves
  // update that same row instead of creating new ones.
  const [editingLetterId, setEditingLetterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingToRider, setSendingToRider] = useState(false);
  // Row actions live in a single "⋮" dropdown — tracks which letter's
  // view/delete dialog (if any) is open, so only one shared instance of
  // each needs to exist.
  const [viewingLetterId, setViewingLetterId] = useState<string | null>(null);
  const [deletingLetterId, setDeletingLetterId] = useState<string | null>(null);

  const resetForm = () => {
    setSelectedRider(null);
    setTitle("");
    setBody("");
    setLetterDate(todayIso());
    setIncludeStamp(false);
    setIncludeSignature(false);
    setSavedLetterId(null);
    setEditingLetterId(null);
  };

  const loadForEdit = (letter: LetterRow) => {
    setSelectedRider(letter.rider_id ? (riderById.get(letter.rider_id) ?? null) : null);
    setTitle(letter.title);
    setBody(letter.body);
    setLetterDate(letter.letter_date);
    setIncludeStamp(letter.include_stamp);
    setIncludeSignature(letter.include_signature);
    setSavedLetterId(letter.id);
    setEditingLetterId(letter.id);
  };

  const insertIntoBody = (value: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => (b ? `${b} ${value}` : value));
      setSavedLetterId(null);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + value + body.slice(end);
    setBody(next);
    setSavedLetterId(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + value.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const previewAssets = {
    companyName: companyQuery.data?.name ?? "",
    companyLogoUrl: companyQuery.data?.logo_url ?? null,
    companyStampUrl: companyQuery.data?.stamp_url ?? null,
    companySignatureUrl: companyQuery.data?.signature_url ?? null,
    companyUnifiedNumber: companyQuery.data?.unified_number ?? null,
    companyCommercialRegistration: companyQuery.data?.commercial_registration ?? null,
    includeStamp,
    includeSignature,
  };
  const previewContent = {
    title: title || t("letters.titlePlaceholder"),
    body: body || t("letters.bodyPlaceholder"),
    letterDate,
  };
  const previewNode = <LetterDocument assets={previewAssets} content={previewContent} t={t} />;
  const { portal: previewPortal, print: printPreview } = useLetterPrint(previewNode);

  const handleSave = async () => {
    if (!title.trim()) return toast.error(t("letters.toastTitleRequired"));
    if (!body.trim()) return toast.error(t("letters.toastBodyRequired"));
    if (!letterDate || !isValidExpiryDate(letterDate)) {
      return toast.error(t("letters.toastInvalidDate"));
    }
    setSaving(true);
    try {
      if (editingLetterId) {
        await updateFn({
          data: {
            letterId: editingLetterId,
            title: title.trim(),
            body: body.trim(),
            letterDate,
            includeStamp,
            includeSignature,
          },
        });
        setSavedLetterId(editingLetterId);
        toast.success(t("letters.toastUpdateSuccess"));
      } else {
        const res = await createFn({
          data: {
            riderId: selectedRider?.id ?? null,
            title: title.trim(),
            body: body.trim(),
            letterDate,
            includeStamp,
            includeSignature,
          },
        });
        setSavedLetterId(res.id);
        // Further saves of this same session now update this letter rather
        // than creating a new one each time.
        setEditingLetterId(res.id);
        toast.success(t("letters.toastSaveSuccess"));
      }
      queryClient.invalidateQueries({ queryKey: ["company-letters"] });
    } catch (err) {
      toast.error(errText(err, t("letters.toastSaveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleSendToRider = async () => {
    if (!savedLetterId || !selectedRider) return;
    setSendingToRider(true);
    try {
      await sendToRiderFn({ data: { letterId: savedLetterId, riderId: selectedRider.id } });
      dispatchPush({ source: "letter", id: savedLetterId });
      toast.success(t("letters.toastSendSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-letters"] });
    } catch (err) {
      toast.error(errText(err, t("letters.toastSendFailed")));
    } finally {
      setSendingToRider(false);
    }
  };

  const handleDelete = async (letterId: string) => {
    try {
      await deleteFn({ data: { letterId } });
      toast.success(t("letters.toastDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-letters"] });
    } catch (err) {
      toast.error(errText(err, t("letters.toastDeleteFailed")));
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <div>
        <h2 className="text-2xl font-bold">{t("letters.pageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("letters.pageDesc")}</p>
      </div>

      {canWrite && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4" />
                  {t("letters.pageTitle")}
                </CardTitle>
                <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                  <Plus className="ms-1.5 h-3.5 w-3.5" />
                  {t("letters.newLetterButton")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("letters.riderLabel")}</Label>
                <RiderPicker
                  riders={ridersQuery.data ?? []}
                  selectedRider={selectedRider}
                  onSelect={(r) => {
                    setSelectedRider(r);
                    setSavedLetterId(null);
                  }}
                  onClear={() => {
                    setSelectedRider(null);
                    setSavedLetterId(null);
                  }}
                  canRotatePhotos={adminCheck.data?.ridersAccess === "full"}
                  t={t}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("letters.titleLabel")}</Label>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSavedLetterId(null);
                  }}
                  placeholder={t("letters.titlePlaceholder")}
                />
              </div>
              {selectedRider && (
                <InsertRiderFields rider={selectedRider} t={t} onInsert={insertIntoBody} />
              )}
              <div className="space-y-1.5">
                <Label>{t("letters.bodyLabel")}</Label>
                <Textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setSavedLetterId(null);
                  }}
                  placeholder={t("letters.bodyPlaceholder")}
                  rows={7}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("letters.dateLabel")}</Label>
                <DateInputDMY
                  value={letterDate}
                  onChange={(v) => {
                    setLetterDate(v);
                    setSavedLetterId(null);
                  }}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeStamp}
                    onCheckedChange={(v) => {
                      setIncludeStamp(v === true);
                      setSavedLetterId(null);
                    }}
                  />
                  {t("letters.includeStampLabel")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeSignature}
                    onCheckedChange={(v) => {
                      setIncludeSignature(v === true);
                      setSavedLetterId(null);
                    }}
                  />
                  {t("letters.includeSignatureLabel")}
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("letters.saveButton")}
                </Button>
                {savedLetterId && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendToRider}
                      disabled={!selectedRider || sendingToRider}
                      title={!selectedRider ? t("letters.sendRequiresRiderHint") : undefined}
                    >
                      {sendingToRider ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="ms-1.5 h-4 w-4" />
                          {t("letters.sendButton")}
                        </>
                      )}
                    </Button>
                    <Button type="button" variant="outline" onClick={printPreview}>
                      <Printer className="ms-1.5 h-4 w-4" />
                      {t("letters.printButton")}
                    </Button>
                    <Button type="button" variant="outline" onClick={printPreview}>
                      {t("letters.downloadPdfButton")}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>{t("letters.previewTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {previewNode}
              {previewPortal}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>{t("letters.savedSectionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {lettersQuery.isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {lettersQuery.data && lettersQuery.data.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("letters.savedEmpty")}
            </p>
          )}
          {lettersQuery.data && lettersQuery.data.length > 0 && (
            <>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  placeholder={t("letters.savedSearchPlaceholder")}
                  className="pe-9"
                />
              </div>
              {filteredLetters.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("letters.savedSearchNoResults")}
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <div className="max-h-[24rem] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="min-w-[180px]">{t("letters.tableTitle")}</TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("letters.tableRider")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("letters.tableDate")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("letters.tableStatus")}
                          </TableHead>
                          <TableHead className="w-16" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLetters.map((l) => {
                          const rider = l.rider_id ? riderById.get(l.rider_id) : null;
                          return (
                            <TableRow key={l.id}>
                              <TableCell className="font-medium">{l.title}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {rider?.rider_name || t("letters.noRiderBadge")}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatDate(l.letter_date)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge
                                  variant={l.is_sent ? "default" : "outline"}
                                  className="text-xs"
                                >
                                  {l.is_sent ? t("letters.sentBadge") : t("letters.notSentBadge")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-end">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button type="button" size="sm" variant="ghost">
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {canWrite && (
                                      <DropdownMenuItem onClick={() => loadForEdit(l)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                        {t("letters.editButton")}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => setViewingLetterId(l.id)}>
                                      <Eye className="h-3.5 w-3.5" />
                                      {t("letters.viewButton")}
                                    </DropdownMenuItem>
                                    {canWrite && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => setDeletingLetterId(l.id)}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          {t("admin.delete")}
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
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
        </CardContent>
      </Card>
      {viewingLetterId &&
        (() => {
          const letter = lettersQuery.data?.find((x) => x.id === viewingLetterId);
          return (
            letter && (
              <LetterViewDialog
                letter={letter}
                companyName={companyQuery.data?.name ?? ""}
                companyLogoUrl={companyQuery.data?.logo_url ?? null}
                companyStampUrl={companyQuery.data?.stamp_url ?? null}
                companySignatureUrl={companyQuery.data?.signature_url ?? null}
                companyUnifiedNumber={companyQuery.data?.unified_number ?? null}
                companyCommercialRegistration={companyQuery.data?.commercial_registration ?? null}
                t={t}
                open
                onOpenChange={(v) => !v && setViewingLetterId(null)}
              />
            )
          );
        })()}
      <AlertDialog open={!!deletingLetterId} onOpenChange={(v) => !v && setDeletingLetterId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("letters.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("letters.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingLetterId) handleDelete(deletingLetterId);
                setDeletingLetterId(null);
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
