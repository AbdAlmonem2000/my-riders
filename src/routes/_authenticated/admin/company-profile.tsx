import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BellRing,
  Building2,
  Download,
  FileText,
  Hash,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mail,
  PenTool,
  Pencil,
  Plus,
  Stamp,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { StatusBadge } from "@/components/doc-status-badge";
import { DateInputDMY } from "@/components/date-input-dmy";
import { checkIsAdmin } from "@/lib/reports.functions";
import {
  updateCompanyExpiryNotifyDays,
  updateCompanyLogo,
  updateCompanyName,
  updateCompanyRegistration,
  updateCompanySignature,
  updateCompanyStamp,
} from "@/lib/accounts.functions";
import { uploadCompanyLogo, uploadCompanySignature, uploadCompanyStamp } from "@/lib/company-logo";
import {
  uploadCompanyDocument,
  updateCompanyDocumentExpiry,
  deleteCompanyDocument,
  getCompanyDocumentDownloadUrl,
} from "@/lib/company-documents.functions";
import { computeDocStatus, hasAllowedDocExtension, isValidExpiryDate } from "@/lib/document-status";
import { formatDate } from "@/lib/date-format";
import { errText } from "@/lib/error-text";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/company-profile")({
  component: AdminCompanyProfile,
});

interface CompanyDocRow {
  id: string;
  label: string;
  storage_path: string;
  file_name: string;
  expiry_date: string;
  uploaded_at: string;
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
    </div>
  );
}

function NameSection({
  companyId,
  currentName,
  t,
}: {
  companyId: string;
  currentName: string | null;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const updateNameFn = useServerFn(updateCompanyName);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateNameFn({ data: { id: companyId, name: name.trim() } });
      toast.success(t("admin.save"));
      setName("");
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastNameFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <SectionLabel icon={Building2}>{t("companyProfile.nameTitle")}</SectionLabel>
      <p className="text-xs text-muted-foreground">
        {t("companyProfile.currentNameLabel")}: {currentName ?? "—"}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("companyProfile.newNamePlaceholder")}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
        </Button>
      </form>
    </div>
  );
}

// The default lead time (in days) for the "document about to expire" in-app
// alert bell, applied to anyone in the company who hasn't set a personal
// override of their own (see PersonalExpiryNotifyDaysSection below).
function CompanyExpiryNotifyDaysSection({
  companyId,
  currentDays,
  t,
}: {
  companyId: string;
  currentDays: number;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateCompanyExpiryNotifyDays);
  const [days, setDays] = useState(String(currentDays));
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(days);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      return toast.error(t("companyProfile.toastExpiryNotifyDaysInvalid"));
    }
    setSaving(true);
    try {
      await updateFn({ data: { id: companyId, days: parsed } });
      toast.success(t("admin.save"));
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastExpiryNotifyDaysFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <SectionLabel icon={BellRing}>{t("companyProfile.expiryNotifyDaysTitle")}</SectionLabel>
      <p className="text-xs text-muted-foreground">{t("companyProfile.expiryNotifyDaysDesc")}</p>
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-24"
        />
        <Button type="submit" size="sm" disabled={saving || !days}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
        </Button>
      </form>
    </div>
  );
}

// The admin's own personal override — same self-service RPC as a staff
// member's copy of this field on the account page (the row is theirs, so no
// company/role check is needed). Blank falls back to the company default
// set just above.
function PersonalExpiryNotifyDaysSection({
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
        {t("companyProfile.expiryNotifyDaysPersonalDesc")} (
        {t("account.expiryNotifyDaysCompanyDefault")}: {companyDays})
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

function EmailSection({ t }: { t: (key: TranslationKey) => string }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const userQuery = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw new Error(error.message);
      toast.success(t("companyProfile.toastEmailChangeSent"));
      setEmail("");
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastEmailFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <SectionLabel icon={Mail}>{t("companyProfile.emailTitle")}</SectionLabel>
      <p className="text-xs text-muted-foreground">
        {t("companyProfile.currentEmailLabel")}: {userQuery.data?.email ?? "—"}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("companyProfile.newEmailPlaceholder")}
          dir="ltr"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={saving || !email.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
        </Button>
      </form>
    </div>
  );
}

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

function RegistrationSection({
  companyId,
  currentUnifiedNumber,
  currentCommercialRegistration,
  t,
}: {
  companyId: string;
  currentUnifiedNumber: string | null;
  currentCommercialRegistration: string | null;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateCompanyRegistration);
  const [unifiedNumber, setUnifiedNumber] = useState(currentUnifiedNumber ?? "");
  const [commercialRegistration, setCommercialRegistration] = useState(
    currentCommercialRegistration ?? "",
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const unified = unifiedNumber.trim();
    const cr = commercialRegistration.trim();
    if (unified && !/^7\d{9}$/.test(unified)) {
      return toast.error(t("companyProfile.toastUnifiedNumberInvalid"));
    }
    if (cr && !/^10\d{8}$/.test(cr)) {
      return toast.error(t("companyProfile.toastCommercialRegistrationInvalid"));
    }
    setSaving(true);
    try {
      await updateFn({
        data: { id: companyId, unifiedNumber: unified || null, commercialRegistration: cr || null },
      });
      toast.success(t("admin.save"));
      queryClient.invalidateQueries({ queryKey: ["company-profile", companyId] });
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastRegistrationFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <SectionLabel icon={Hash}>{t("companyProfile.registrationTitle")}</SectionLabel>
      <p className="text-xs text-muted-foreground">{t("companyProfile.registrationDesc")}</p>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label className="text-xs">{t("companyProfile.unifiedNumberLabel")}</Label>
          <Input
            value={unifiedNumber}
            onChange={(e) => setUnifiedNumber(e.target.value)}
            placeholder="7XXXXXXXXX"
            dir="ltr"
            maxLength={10}
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("companyProfile.commercialRegistrationLabel")}</Label>
          <Input
            value={commercialRegistration}
            onChange={(e) => setCommercialRegistration(e.target.value)}
            placeholder="10XXXXXXXX"
            dir="ltr"
            maxLength={10}
            className="font-mono"
          />
        </div>
        <Button type="submit" size="sm" disabled={saving} className="self-end">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
        </Button>
      </form>
    </div>
  );
}

function AssetUploadField({
  icon: Icon,
  title,
  currentUrl,
  saving,
  onSave,
  t,
}: {
  icon: typeof ImageIcon;
  title: string;
  currentUrl: string | null;
  saving: boolean;
  onSave: (file: File) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t("documents.toastFileRequired"));
    await onSave(file);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={title}
            className="h-10 w-10 shrink-0 rounded border border-border bg-background object-contain p-0.5"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <Input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
      <Button type="submit" size="sm" className="w-full" disabled={saving || !file}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.save")}
      </Button>
    </form>
  );
}

function CompanyDocumentRow({
  doc,
  saving,
  t,
  onReplace,
  onUpdateExpiry,
  onDelete,
  onDownload,
}: {
  doc: CompanyDocRow;
  saving: boolean;
  t: (key: TranslationKey) => string;
  onReplace: (
    documentId: string,
    label: string,
    file: File,
    expiryDate: string,
  ) => Promise<boolean>;
  onUpdateExpiry: (documentId: string, expiryDate: string) => Promise<boolean>;
  onDelete: (documentId: string) => void;
  onDownload: (documentId: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "replace" | "editDate">("view");
  const [label, setLabel] = useState(doc.label);
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState(doc.expiry_date);
  const fileRef = useRef<HTMLInputElement>(null);

  const { status, daysLeft } = computeDocStatus(doc.expiry_date);

  const startReplace = () => {
    setLabel(doc.label);
    setExpiryDate(doc.expiry_date);
    setFile(null);
    setMode("replace");
  };

  const startEditDate = () => {
    setExpiryDate(doc.expiry_date);
    setMode("editDate");
  };

  const submitReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return toast.error(t("companyProfile.toastLabelRequired"));
    if (!file) return toast.error(t("documents.toastFileRequired"));
    if (!hasAllowedDocExtension(file.name))
      return toast.error(t("documents.toastInvalidExtension"));
    if (!expiryDate || !isValidExpiryDate(expiryDate)) {
      return toast.error(t("documents.toastInvalidDate"));
    }
    const ok = await onReplace(doc.id, label.trim(), file, expiryDate);
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
    const ok = await onUpdateExpiry(doc.id, expiryDate);
    if (ok) setMode("view");
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{doc.label}</span>
        </div>
        <StatusBadge status={status} daysLeft={daysLeft} t={t} />
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <div className="truncate">{doc.file_name}</div>
        <div>
          {t("documents.expiryDateLabel")}: {formatDate(doc.expiry_date)}
        </div>
        <div>
          {t("documents.uploadedAtLabel")}: {formatDate(doc.uploaded_at)}
        </div>
      </div>

      {mode === "view" && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={startReplace}>
            <Upload className="ms-1.5 h-3.5 w-3.5" />
            {t("documents.replaceButton")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title={t("documents.editDateTooltip")}
            onClick={startEditDate}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title={t("documents.downloadButton")}
            onClick={() => onDownload(doc.id)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
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
                <AlertDialogDescription>{t("documents.deleteConfirmDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(doc.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("admin.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {mode === "replace" && (
        <form onSubmit={submitReplace} className="mt-3 space-y-2 rounded-md bg-muted/40 p-2.5">
          <div className="space-y-1">
            <Label className="text-xs">{t("companyProfile.documentLabelLabel")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
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
            <DateInputDMY value={expiryDate} onChange={setExpiryDate} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("documents.replaceButton")
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
            <DateInputDMY value={expiryDate} onChange={setExpiryDate} />
          </div>
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

function AddCompanyDocument({
  saving,
  t,
  onAdd,
}: {
  saving: boolean;
  t: (key: TranslationKey) => string;
  onAdd: (label: string, file: File, expiryDate: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return toast.error(t("companyProfile.toastLabelRequired"));
    if (!file) return toast.error(t("documents.toastFileRequired"));
    if (!hasAllowedDocExtension(file.name))
      return toast.error(t("documents.toastInvalidExtension"));
    if (!expiryDate || !isValidExpiryDate(expiryDate)) {
      return toast.error(t("documents.toastInvalidDate"));
    }
    const ok = await onAdd(label.trim(), file, expiryDate);
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
        {t("companyProfile.addDocumentButton")}
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="space-y-1">
        <Label className="text-xs">{t("companyProfile.documentLabelLabel")}</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("companyProfile.documentLabelPlaceholder")}
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
        <DateInputDMY value={expiryDate} onChange={setExpiryDate} />
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

function AdminCompanyProfile() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const updateLogoFn = useServerFn(updateCompanyLogo);
  const updateStampFn = useServerFn(updateCompanyStamp);
  const updateSignatureFn = useServerFn(updateCompanySignature);
  const uploadDocFn = useServerFn(uploadCompanyDocument);
  const updateDocExpiryFn = useServerFn(updateCompanyDocumentExpiry);
  const deleteDocFn = useServerFn(deleteCompanyDocument);
  const downloadUrlFn = useServerFn(getCompanyDocumentDownloadUrl);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });
  const companyId = adminCheck.data?.companyId ?? null;

  const companyQuery = useQuery({
    queryKey: ["company-profile", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("logo_url, stamp_url, signature_url, unified_number, commercial_registration")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const docsQuery = useQuery({
    queryKey: ["company-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_documents")
        .select("id, label, storage_path, file_name, expiry_date, uploaded_at")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as CompanyDocRow[];
    },
  });

  const [logoSaving, setLogoSaving] = useState(false);
  const [stampSaving, setStampSaving] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);

  const handleLogoSave = async (file: File) => {
    if (!companyId) return;
    setLogoSaving(true);
    try {
      const logoUrl = await uploadCompanyLogo(file);
      await updateLogoFn({ data: { id: companyId, logoUrl } });
      toast.success(t("admin.save"));
      queryClient.invalidateQueries({ queryKey: ["company-profile", companyId] });
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastAssetFailed")));
    } finally {
      setLogoSaving(false);
    }
  };

  const handleStampSave = async (file: File) => {
    if (!companyId) return;
    setStampSaving(true);
    try {
      const stampUrl = await uploadCompanyStamp(file);
      await updateStampFn({ data: { id: companyId, stampUrl } });
      toast.success(t("admin.save"));
      queryClient.invalidateQueries({ queryKey: ["company-profile", companyId] });
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastAssetFailed")));
    } finally {
      setStampSaving(false);
    }
  };

  const handleSignatureSave = async (file: File) => {
    if (!companyId) return;
    setSignatureSaving(true);
    try {
      const signatureUrl = await uploadCompanySignature(file);
      await updateSignatureFn({ data: { id: companyId, signatureUrl } });
      toast.success(t("admin.save"));
      queryClient.invalidateQueries({ queryKey: ["company-profile", companyId] });
    } catch (err) {
      toast.error(errText(err, t("companyProfile.toastAssetFailed")));
    } finally {
      setSignatureSaving(false);
    }
  };

  const handleAddDocument = async (label: string, file: File, expiryDate: string) => {
    if (!companyId) return false;
    setSavingDocId("new");
    try {
      const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
      const safeExt = extMatch ? extMatch[0].toLowerCase() : "";
      const path = `${companyId}/${crypto.randomUUID()}${safeExt}`;
      const { error: upErr } = await supabase.storage
        .from("company-documents")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      await uploadDocFn({
        data: {
          companyId,
          documentId: null,
          label,
          storagePath: path,
          fileName: file.name,
          expiryDate,
        },
      });
      toast.success(t("documents.toastUploadSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-documents"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("documents.toastUploadFailed")));
      return false;
    } finally {
      setSavingDocId(null);
    }
  };

  const handleReplaceDocument = async (
    documentId: string,
    label: string,
    file: File,
    expiryDate: string,
  ) => {
    if (!companyId) return false;
    setSavingDocId(documentId);
    try {
      const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
      const safeExt = extMatch ? extMatch[0].toLowerCase() : "";
      const path = `${companyId}/${crypto.randomUUID()}${safeExt}`;
      const { error: upErr } = await supabase.storage
        .from("company-documents")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      await uploadDocFn({
        data: { companyId, documentId, label, storagePath: path, fileName: file.name, expiryDate },
      });
      toast.success(t("documents.toastUploadSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-documents"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("documents.toastUploadFailed")));
      return false;
    } finally {
      setSavingDocId(null);
    }
  };

  const handleUpdateExpiry = async (documentId: string, expiryDate: string) => {
    if (!companyId) return false;
    setSavingDocId(documentId);
    try {
      await updateDocExpiryFn({ data: { companyId, documentId, expiryDate } });
      toast.success(t("documents.toastExpiryUpdateSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-documents"] });
      return true;
    } catch (err) {
      toast.error(errText(err, t("documents.toastExpiryUpdateFailed")));
      return false;
    } finally {
      setSavingDocId(null);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!companyId) return;
    try {
      await deleteDocFn({ data: { companyId, documentId } });
      toast.success(t("documents.toastDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["company-documents"] });
    } catch (err) {
      toast.error(errText(err, t("documents.toastDeleteFailed")));
    }
  };

  const handleDownload = async (documentId: string) => {
    if (!companyId) return;
    try {
      const { url } = await downloadUrlFn({ data: { companyId, documentId } });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("documents.toastDownloadFailed")));
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
      <div>
        <h2 className="text-2xl font-bold">{t("companyProfile.pageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("companyProfile.pageDesc")}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{t("companyProfile.accountTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {companyId && (
            <div className="pb-4">
              <NameSection
                companyId={companyId}
                currentName={adminCheck.data?.companyName ?? null}
                t={t}
              />
            </div>
          )}
          <div className="py-4">
            <EmailSection t={t} />
          </div>
          <div className="py-4">
            <PasswordSection t={t} />
          </div>
          {companyId && (
            <div className="pt-4">
              <RegistrationSection
                companyId={companyId}
                currentUnifiedNumber={companyQuery.data?.unified_number ?? null}
                currentCommercialRegistration={companyQuery.data?.commercial_registration ?? null}
                t={t}
              />
            </div>
          )}
          {companyId && (
            <div className="pt-4">
              <CompanyExpiryNotifyDaysSection
                companyId={companyId}
                currentDays={adminCheck.data?.companyExpiryNotifyDays ?? 30}
                t={t}
              />
            </div>
          )}
          <div className="pt-4">
            <PersonalExpiryNotifyDaysSection
              personalDays={adminCheck.data?.personalExpiryNotifyDays ?? null}
              companyDays={adminCheck.data?.companyExpiryNotifyDays ?? 30}
              t={t}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{t("companyProfile.assetsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <AssetUploadField
              icon={ImageIcon}
              title={t("companyProfile.logoTitle")}
              currentUrl={companyQuery.data?.logo_url ?? null}
              saving={logoSaving}
              onSave={handleLogoSave}
              t={t}
            />
            <AssetUploadField
              icon={Stamp}
              title={t("companyProfile.stampTitle")}
              currentUrl={companyQuery.data?.stamp_url ?? null}
              saving={stampSaving}
              onSave={handleStampSave}
              t={t}
            />
            <AssetUploadField
              icon={PenTool}
              title={t("companyProfile.signatureTitle")}
              currentUrl={companyQuery.data?.signature_url ?? null}
              saving={signatureSaving}
              onSave={handleSignatureSave}
              t={t}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{t("companyProfile.documentsTitle")}</CardTitle>
          <CardDescription>{t("companyProfile.documentsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {docsQuery.isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {(docsQuery.data ?? []).map((doc) => (
            <CompanyDocumentRow
              key={doc.id}
              doc={doc}
              saving={savingDocId === doc.id}
              t={t}
              onReplace={handleReplaceDocument}
              onUpdateExpiry={handleUpdateExpiry}
              onDelete={handleDelete}
              onDownload={handleDownload}
            />
          ))}
          <AddCompanyDocument saving={savingDocId === "new"} t={t} onAdd={handleAddDocument} />
        </CardContent>
      </Card>
    </div>
  );
}
