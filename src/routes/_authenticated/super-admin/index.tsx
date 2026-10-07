import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LockOpen,
  Trash2,
  Plus,
  Building2,
  StickyNote,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  createCompany,
  deleteCompany,
  listAccounts,
  listCompanies,
  setCompanySuspended,
  updateCompanyLogo,
  updateCompanyName,
  updateCompanyNotes,
  updateCompanyPlan,
} from "@/lib/accounts.functions";
import {
  TierPicker,
  DocumentsAccessPicker,
  type TieredAccess,
  type DocumentsAccess,
} from "@/components/access-tier-picker";
import { uploadCompanyLogo } from "@/lib/company-logo";
import { ChangeNameDialog, ChangeLogoDialog } from "@/components/company-dialogs";
import { formatDate } from "@/lib/date-format";
import { useLanguage, type Lang, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  component: CompaniesPage,
});

interface CompanyPlan {
  overviewAccess: boolean;
  // Only meaningful when overviewAccess is on — shows/hides just the DAILY
  // overview page; the monthly one stays available either way.
  overviewDailyAccess: boolean;
  ridersAccess: TieredAccess;
  reportsAccess: TieredAccess;
  // Only meaningful when reportsAccess isn't 'none' — shows/hides just the
  // DAILY reports page; the monthly one stays available either way.
  reportsDailyAccess: boolean;
  documentsAccess: DocumentsAccess;
  lettersAccess: TieredAccess;
  notificationsAccess: boolean;
  usersAccess: boolean;
  companyProfileAccess: boolean;
  // Only meaningful when documentsAccess isn't 'none' — the Operating Cards
  // page is just another view of the same document data.
  operatingCardsAccess: boolean;
  // Only meaningful when documentsAccess isn't 'none' — same reasoning as
  // operatingCardsAccess above.
  expiryAlertsAccess: boolean;
}

const ALL_ACCESS_PLAN: CompanyPlan = {
  overviewAccess: true,
  overviewDailyAccess: true,
  ridersAccess: "full",
  reportsAccess: "full",
  reportsDailyAccess: true,
  documentsAccess: "full",
  lettersAccess: "full",
  notificationsAccess: true,
  usersAccess: true,
  companyProfileAccess: true,
  operatingCardsAccess: true,
  expiryAlertsAccess: true,
};

function CompanyPlanDialog({
  companyName,
  currentPlan,
  onSubmit,
  t,
}: {
  companyName: string;
  currentPlan: CompanyPlan;
  onSubmit: (plan: CompanyPlan) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<CompanyPlan>(currentPlan);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(plan);
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setPlan(currentPlan);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.companyPlanTooltip")}
          className="transition-transform hover:scale-110"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("superAdmin.companyPlanTooltip")} — {companyName}
          </DialogTitle>
          <DialogDescription>{t("superAdmin.companyPlanDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPlan({ ...ALL_ACCESS_PLAN })}
          >
            {t("users.grantAllButton")}
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={plan.overviewAccess}
              onCheckedChange={(v) =>
                setPlan((p) => ({
                  ...p,
                  overviewAccess: !!v,
                  overviewDailyAccess: !!v && p.overviewDailyAccess,
                }))
              }
            />
            {t("users.overviewAccessLabel")}
          </label>
          {plan.overviewAccess && (
            <label className="me-4 flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={plan.overviewDailyAccess}
                onCheckedChange={(v) => setPlan((p) => ({ ...p, overviewDailyAccess: !!v }))}
              />
              {t("superAdmin.overviewDailyAccessLabel")}
            </label>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("users.ridersAccessLabel")}</Label>
            <TierPicker
              value={plan.ridersAccess}
              fullLabelKey="users.ridersAccessFullLabel"
              onChange={(v) => setPlan((p) => ({ ...p, ridersAccess: v }))}
              t={t}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("users.reportsAccessLabel")}</Label>
            <TierPicker
              value={plan.reportsAccess}
              fullLabelKey="users.reportsAccessFullLabel"
              onChange={(v) =>
                setPlan((p) => ({
                  ...p,
                  reportsAccess: v,
                  reportsDailyAccess: v !== "none" && p.reportsDailyAccess,
                }))
              }
              t={t}
            />
            {plan.reportsAccess !== "none" && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={plan.reportsDailyAccess}
                  onCheckedChange={(v) => setPlan((p) => ({ ...p, reportsDailyAccess: !!v }))}
                />
                {t("superAdmin.reportsDailyAccessLabel")}
              </label>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("users.documentsAccessLabel")}</Label>
            <DocumentsAccessPicker
              value={plan.documentsAccess}
              onChange={(v) =>
                setPlan((p) => ({
                  ...p,
                  documentsAccess: v,
                  operatingCardsAccess: v !== "none" && p.operatingCardsAccess,
                  expiryAlertsAccess: v !== "none" && p.expiryAlertsAccess,
                }))
              }
              t={t}
            />
            {plan.documentsAccess !== "none" && (
              <>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={plan.operatingCardsAccess}
                    onCheckedChange={(v) => setPlan((p) => ({ ...p, operatingCardsAccess: !!v }))}
                  />
                  {t("users.operatingCardsAccessLabel")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={plan.expiryAlertsAccess}
                    onCheckedChange={(v) => setPlan((p) => ({ ...p, expiryAlertsAccess: !!v }))}
                  />
                  {t("users.expiryAlertsAccessLabel")}
                </label>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("users.lettersAccessLabel")}</Label>
            <TierPicker
              value={plan.lettersAccess}
              fullLabelKey="users.lettersAccessFullLabel"
              onChange={(v) => setPlan((p) => ({ ...p, lettersAccess: v }))}
              t={t}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={plan.notificationsAccess}
              onCheckedChange={(v) => setPlan((p) => ({ ...p, notificationsAccess: !!v }))}
            />
            {t("superAdmin.notificationsAccessLabel")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={plan.usersAccess}
              onCheckedChange={(v) => setPlan((p) => ({ ...p, usersAccess: !!v }))}
            />
            {t("superAdmin.usersAccessLabel")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={plan.companyProfileAccess}
              onCheckedChange={(v) => setPlan((p) => ({ ...p, companyProfileAccess: !!v }))}
            />
            {t("superAdmin.companyProfileAccessLabel")}
          </label>
          <Button type="submit" size="sm" disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("superAdmin.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompaniesPage() {
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();
  const listCompaniesFn = useServerFn(listCompanies);
  const listAccountsFn = useServerFn(listAccounts);
  const createCompanyFn = useServerFn(createCompany);
  const deleteCompanyFn = useServerFn(deleteCompany);
  const updateLogoFn = useServerFn(updateCompanyLogo);
  const setSuspendedFn = useServerFn(setCompanySuspended);
  const updateNameFn = useServerFn(updateCompanyName);
  const updateNotesFn = useServerFn(updateCompanyNotes);
  const updatePlanFn = useServerFn(updateCompanyPlan);

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => listCompaniesFn(),
  });
  // Same query the Accounts page uses (shared cache) — just to know which
  // companies still have accounts, so the delete button can be blocked
  // before the super admin even tries.
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccountsFn(),
  });
  const accountCountByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts.data ?? []) {
      if (!a.companyId) continue;
      map.set(a.companyId, (map.get(a.companyId) ?? 0) + 1);
    }
    return map;
  }, [accounts.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyLogo, setNewCompanyLogo] = useState<File | null>(null);
  const newCompanyLogoRef = useRef<HTMLInputElement>(null);
  const createCompanyMut = useMutation({
    mutationFn: async ({ name, logo }: { name: string; logo: File | null }) => {
      const logoUrl = logo ? await uploadCompanyLogo(logo) : undefined;
      return createCompanyFn({ data: { name, logoUrl } });
    },
    onSuccess: () => {
      toast.success(t("superAdmin.toastCompanyCreated"));
      setNewCompanyName("");
      setNewCompanyLogo(null);
      if (newCompanyLogoRef.current) newCompanyLogoRef.current.value = "";
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSuspendedMut = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      setSuspendedFn({ data: { id, suspended } }),
    onSuccess: (_res, { suspended }) => {
      toast.success(
        suspended ? t("superAdmin.toastCompanySuspended") : t("superAdmin.toastCompanyActivated"),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
      style={{ animationDelay: "40ms" }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t("superAdmin.companiesCardTitle")}
        </CardTitle>
        <CardDescription>{t("superAdmin.companiesCardDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCompanyName.trim())
              createCompanyMut.mutate({ name: newCompanyName.trim(), logo: newCompanyLogo });
          }}
        >
          <Input
            placeholder={t("superAdmin.newCompanyPlaceholder")}
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            className="flex-1"
          />
          <Input
            ref={newCompanyLogoRef}
            type="file"
            accept="image/*"
            title={t("superAdmin.logoFieldTitle")}
            onChange={(e) => setNewCompanyLogo(e.target.files?.[0] ?? null)}
            className="w-auto max-w-[200px]"
          />
          <Button
            type="submit"
            disabled={createCompanyMut.isPending}
            className="transition-transform active:scale-[0.98]"
          >
            {createCompanyMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="ms-2 h-4 w-4" />
                {t("superAdmin.addButton")}
              </>
            )}
          </Button>
        </form>

        {companies.data && companies.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("superAdmin.tableLogo")}</TableHead>
                <TableHead>{t("superAdmin.tableCompany")}</TableHead>
                <TableHead>{t("superAdmin.tableStatus")}</TableHead>
                <TableHead className="min-w-55">{t("users.tablePages")}</TableHead>
                <TableHead>{t("superAdmin.tableCreatedDate")}</TableHead>
                <TableHead className="text-end">{t("superAdmin.tableActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.data.map((c, i) => (
                <TableRow
                  key={c.id}
                  className="animate-in fade-in transition-colors duration-300 fill-mode-[backwards]"
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                >
                  <TableCell>
                    {c.logo_url ? (
                      <img
                        src={c.logo_url}
                        alt={c.name}
                        className="h-8 w-8 rounded object-contain"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{c.name}</div>
                    {c.notes && (
                      <div className="mt-0.5 max-w-[220px] truncate text-xs font-normal text-muted-foreground">
                        {c.notes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.is_suspended ? (
                      <Badge variant="destructive">{t("superAdmin.statusSuspended")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("superAdmin.statusActive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.plan_overview_access && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("admin.navOverview")}
                        </Badge>
                      )}
                      {c.plan_riders_access !== "none" && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("admin.navRiders")}
                        </Badge>
                      )}
                      {c.plan_reports_access !== "none" && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("admin.navReports")}
                        </Badge>
                      )}
                      {c.plan_documents_access !== "none" && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("admin.navDocuments")}
                        </Badge>
                      )}
                      {c.plan_letters_access !== "none" && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("admin.navLetters")}
                        </Badge>
                      )}
                      {!c.plan_overview_access &&
                        c.plan_riders_access === "none" &&
                        c.plan_reports_access === "none" &&
                        c.plan_documents_access === "none" &&
                        c.plan_letters_access === "none" && (
                          <span className="text-xs text-muted-foreground">
                            {t("users.accessNoneLabel")}
                          </span>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(c.created_at)}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <ChangeNameDialog
                        currentName={c.name}
                        t={t}
                        onSubmit={async (name) => {
                          await updateNameFn({ data: { id: c.id, name } });
                          toast.success(t("superAdmin.toastNameUpdated"));
                          invalidate();
                        }}
                      />
                      <ChangeLogoDialog
                        companyName={c.name}
                        currentLogoUrl={c.logo_url}
                        t={t}
                        onSubmit={async (logoUrl) => {
                          await updateLogoFn({ data: { id: c.id, logoUrl } });
                          toast.success(t("superAdmin.toastLogoUpdated"));
                          invalidate();
                        }}
                      />
                      <CompanyPlanDialog
                        companyName={c.name}
                        currentPlan={{
                          overviewAccess: c.plan_overview_access,
                          overviewDailyAccess: c.plan_overview_daily_access,
                          ridersAccess: c.plan_riders_access as TieredAccess,
                          reportsAccess: c.plan_reports_access as TieredAccess,
                          reportsDailyAccess: c.plan_reports_daily_access,
                          documentsAccess: c.plan_documents_access as DocumentsAccess,
                          lettersAccess: c.plan_letters_access as TieredAccess,
                          notificationsAccess: c.plan_notifications_access,
                          usersAccess: c.plan_users_access,
                          companyProfileAccess: c.plan_company_profile_access,
                          operatingCardsAccess: c.plan_operating_cards_access,
                          expiryAlertsAccess: c.plan_expiry_alerts_access,
                        }}
                        t={t}
                        onSubmit={async (plan) => {
                          await updatePlanFn({ data: { id: c.id, ...plan } });
                          toast.success(t("superAdmin.toastPlanUpdated"));
                          invalidate();
                        }}
                      />
                      <CompanyNotesDialog
                        companyName={c.name}
                        currentNotes={c.notes}
                        t={t}
                        onSubmit={async (notes) => {
                          await updateNotesFn({ data: { id: c.id, notes } });
                          toast.success(t("superAdmin.toastNoteUpdated"));
                          invalidate();
                        }}
                      />
                      {c.is_suspended ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t("superAdmin.activateTooltip")}
                          className="text-primary transition-transform hover:scale-110"
                          disabled={setSuspendedMut.isPending}
                          onClick={() => setSuspendedMut.mutate({ id: c.id, suspended: false })}
                        >
                          <LockOpen className="h-4 w-4" />
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={t("superAdmin.suspendTooltip")}
                              className="text-destructive transition-transform hover:scale-110"
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("superAdmin.suspendCompanyTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {lang === "ar"
                                  ? `هيتم إيقاف وصول شركة "${c.name}" وكل المناديب اللي تابعين ليها فورًا. تقدر تفعّل الوصول تاني في أي وقت.`
                                  : `Access for "${c.name}" and all its riders will be blocked immediately. You can re-activate it anytime.`}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() =>
                                  setSuspendedMut.mutate({ id: c.id, suspended: true })
                                }
                              >
                                {t("superAdmin.suspendConfirmButton")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {(accountCountByCompany.get(c.id) ?? 0) > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled
                          title={t("superAdmin.deleteCompanyBlockedTooltip")}
                          className="text-muted-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <DeleteCompanyDialog
                          companyName={c.name}
                          t={t}
                          lang={lang}
                          onSubmit={async (password) => {
                            await deleteCompanyFn({ data: { id: c.id, password } });
                            toast.success(t("superAdmin.toastCompanyDeleted"));
                            invalidate();
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Deleting a company is permanent and, once its accounts are gone, undoable
// only by re-creating everything by hand — so it asks for the super admin's
// own password every time, on top of the normal confirm-and-delete flow.
function DeleteCompanyDialog({
  companyName,
  onSubmit,
  t,
  lang,
}: {
  companyName: string;
  onSubmit: (password: string) => Promise<void>;
  t: (key: TranslationKey) => string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    try {
      await onSubmit(password);
      setOpen(false);
      setPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPassword("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive transition-transform hover:scale-110"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("superAdmin.deleteCompanyTitle")}</DialogTitle>
          <DialogDescription>
            {lang === "ar"
              ? `سيتم حذف الشركة "${companyName}" وجميع تقاريرها ومناديبها نهائيًا. لا يمكن التراجع.`
              : `The company "${companyName}" and all its reports and riders will be permanently deleted. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("superAdmin.confirmYourPasswordLabel")}</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="pl-10"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 left-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("admin.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading || !password}
              className="bg-destructive text-destructive-foreground transition-transform hover:bg-destructive/90 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.delete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompanyNotesDialog({
  companyName,
  currentNotes,
  onSubmit,
  t,
}: {
  companyName: string;
  currentNotes: string;
  onSubmit: (notes: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(currentNotes);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(notes.trim());
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setNotes(currentNotes);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.companyNoteTitle")}
          className={`transition-transform hover:scale-110 ${currentNotes ? "text-primary" : ""}`}
        >
          <StickyNote className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("superAdmin.companyNoteTitle")} — {companyName}
          </DialogTitle>
          <DialogDescription>{t("superAdmin.companyNoteDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("superAdmin.companyNotePlaceholder")}
            maxLength={5000}
            rows={5}
            autoFocus
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading}
              className="transition-transform active:scale-[0.98]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("superAdmin.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
