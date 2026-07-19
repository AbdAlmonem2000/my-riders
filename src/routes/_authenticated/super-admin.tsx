import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  LogOut,
  Trash2,
  Plus,
  Building2,
  Users,
  KeyRound,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Megaphone,
  Pencil,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { checkIsAdmin } from "@/lib/reports.functions";
import {
  createAccount,
  createCompany,
  deleteAccount,
  deleteCompany,
  listAccounts,
  listCompanies,
  updateAccountEmail,
  updateAccountPassword,
  updateCompanyLogo,
  updateCompanyName,
} from "@/lib/accounts.functions";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
} from "@/lib/announcements.functions";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

// Storage keys reject non-ASCII/special characters (see the report-upload
// fix in admin.tsx) — never embed the raw file name.
async function uploadCompanyLogo(file: File): Promise<string> {
  const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
  const safeExt = extMatch ? extMatch[0] : "";
  const path = `${crypto.randomUUID()}${safeExt}`;
  const { error } = await supabase.storage
    .from("company-logos")
    .upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
  return data.publicUrl;
}

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const listCompaniesFn = useServerFn(listCompanies);
  const listAccountsFn = useServerFn(listAccounts);
  const createCompanyFn = useServerFn(createCompany);
  const deleteCompanyFn = useServerFn(deleteCompany);
  const createAccountFn = useServerFn(createAccount);
  const deleteAccountFn = useServerFn(deleteAccount);
  const updatePasswordFn = useServerFn(updateAccountPassword);
  const updateEmailFn = useServerFn(updateAccountEmail);
  const updateLogoFn = useServerFn(updateCompanyLogo);
  const updateNameFn = useServerFn(updateCompanyName);
  const listAnnouncementsFn = useServerFn(listAnnouncements);
  const createAnnouncementFn = useServerFn(createAnnouncement);
  const deleteAnnouncementFn = useServerFn(deleteAnnouncement);

  const check = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn() });
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => listCompaniesFn(),
    enabled: !!check.data?.isSuperAdmin,
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccountsFn(),
    enabled: !!check.data?.isSuperAdmin,
  });
  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncementsFn(),
    enabled: !!check.data?.isSuperAdmin,
  });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const createAnnouncementMut = useMutation({
    mutationFn: () =>
      createAnnouncementFn({ data: { title: announceTitle.trim(), body: announceBody.trim() } }),
    onSuccess: () => {
      toast.success(t("superAdmin.toastAnnouncementSent"));
      setAnnounceTitle("");
      setAnnounceBody("");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const deleteCompanyMut = useMutation({
    mutationFn: (id: string) => deleteCompanyFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("superAdmin.toastCompanyDeleted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAnnouncementMut = useMutation({
    mutationFn: (id: string) => deleteAnnouncementFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("superAdmin.toastAnnouncementDeleted"));
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // New account form
  const [naEmail, setNaEmail] = useState("");
  const [naPassword, setNaPassword] = useState("");
  const [naCompany, setNaCompany] = useState<string>("");
  const [naShow, setNaShow] = useState(false);

  const createAccountMut = useMutation({
    mutationFn: () =>
      createAccountFn({ data: { email: naEmail, password: naPassword, companyId: naCompany } }),
    onSuccess: () => {
      toast.success(t("superAdmin.toastAccountCreated"));
      setNaEmail("");
      setNaPassword("");
      setNaCompany("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAccountMut = useMutation({
    mutationFn: (userId: string) => deleteAccountFn({ data: { userId } }),
    onSuccess: () => {
      toast.success(t("superAdmin.toastAccountDeleted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (check.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!check.data?.isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="animate-in fade-in slide-in-from-bottom-2 max-w-md duration-500">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-semibold">{t("admin.unauthorizedTitle")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("superAdmin.unauthorizedDesc")}</p>
            <div className="mt-4 flex gap-2 justify-center">
              <Button variant="outline" onClick={signOut}>
                {t("admin.logout")}
              </Button>
              <Link to="/admin">
                <Button>{t("superAdmin.companyDashboardButton")}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t("superAdmin.headerTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("superAdmin.headerSubtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="ms-2 h-4 w-4" />
            {t("admin.logout")}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              {t("superAdmin.announcementsCardTitle")}
            </CardTitle>
            <CardDescription>{t("superAdmin.announcementsCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!announceTitle.trim() || !announceBody.trim()) return;
                createAnnouncementMut.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>{t("superAdmin.announcementTitleLabel")}</Label>
                <Input
                  value={announceTitle}
                  onChange={(e) => setAnnounceTitle(e.target.value)}
                  placeholder={t("superAdmin.announcementTitlePlaceholder")}
                  maxLength={150}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.announcementBodyLabel")}</Label>
                <Textarea
                  value={announceBody}
                  onChange={(e) => setAnnounceBody(e.target.value)}
                  placeholder={t("superAdmin.announcementBodyPlaceholder")}
                  maxLength={2000}
                  rows={3}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={createAnnouncementMut.isPending}
                className="transition-transform active:scale-[0.98]"
              >
                {createAnnouncementMut.isPending ? (
                  <>
                    <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                    {t("superAdmin.sending")}
                  </>
                ) : (
                  <>
                    <Send className="ms-2 h-4 w-4" />
                    {t("superAdmin.sendButton")}
                  </>
                )}
              </Button>
            </form>

            {announcements.data && announcements.data.announcements.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("superAdmin.announcementsHistoryTitle")}
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {announcements.data.announcements.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{a.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(a.createdAt).toLocaleDateString(
                              lang === "ar" ? "ar-SA" : "en-US",
                            )}
                          </span>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive transition-transform hover:scale-110"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("superAdmin.deleteAnnouncementTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("superAdmin.deleteAnnouncementDesc")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteAnnouncementMut.mutate(a.id)}
                                >
                                  {t("admin.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {a.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString(
                          lang === "ar" ? "ar-SA" : "en-US",
                        )}
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
                                  {t("superAdmin.deleteCompanyTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {lang === "ar"
                                    ? `سيتم حذف الشركة "${c.name}" وجميع تقاريرها ومناديبها وحسابات موظفيها. لا يمكن التراجع.`
                                    : `The company "${c.name}" and all its reports, riders, and staff accounts will be deleted. This cannot be undone.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteCompanyMut.mutate(c.id)}
                                >
                                  {t("admin.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card
          className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
          style={{ animationDelay: "80ms" }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("superAdmin.accountsCardTitle")}
            </CardTitle>
            <CardDescription>{t("superAdmin.accountsCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="grid gap-3 md:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!naCompany) return toast.error(t("superAdmin.toastChooseCompany"));
                createAccountMut.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>{t("superAdmin.emailLabel")}</Label>
                <Input
                  type="email"
                  required
                  value={naEmail}
                  onChange={(e) => setNaEmail(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.passwordLabel")}</Label>
                <div className="relative">
                  <Input
                    type={naShow ? "text" : "password"}
                    required
                    minLength={6}
                    value={naPassword}
                    onChange={(e) => setNaPassword(e.target.value)}
                    dir="ltr"
                    className="pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setNaShow((v) => !v)}
                    className="absolute inset-y-0 left-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                    tabIndex={-1}
                  >
                    {naShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.companyLabel")}</Label>
                <Select value={naCompany} onValueChange={setNaCompany}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("superAdmin.chooseCompanyPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(companies.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  className="w-full transition-transform active:scale-[0.98]"
                  disabled={createAccountMut.isPending}
                >
                  {createAccountMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="ms-2 h-4 w-4" />
                      {t("superAdmin.createAccountButton")}
                    </>
                  )}
                </Button>
              </div>
            </form>

            {accounts.isLoading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {accounts.data && accounts.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("superAdmin.tableEmail")}</TableHead>
                    <TableHead>{t("superAdmin.tableCompany")}</TableHead>
                    <TableHead>{t("superAdmin.tableLastLogin")}</TableHead>
                    <TableHead className="text-end">{t("superAdmin.tableActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.data.map((u, i) => (
                    <TableRow
                      key={u.id}
                      className="animate-in fade-in transition-colors duration-300 fill-mode-[backwards]"
                      style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                    >
                      <TableCell className="font-medium" dir="ltr">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        {u.isSuperAdmin ? (
                          <Badge>{t("superAdmin.superAdminBadge")}</Badge>
                        ) : u.companyName ? (
                          <Badge variant="secondary">{u.companyName}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.lastSignInAt
                          ? new Date(u.lastSignInAt).toLocaleDateString(
                              lang === "ar" ? "ar-SA" : "en-US",
                            )
                          : t("superAdmin.neverLoggedIn")}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <ChangeEmailDialog
                            userId={u.id}
                            currentEmail={u.email ?? ""}
                            t={t}
                            onSubmit={async (email) => {
                              await updateEmailFn({ data: { userId: u.id, email } });
                              toast.success(t("superAdmin.toastEmailUpdated"));
                              invalidate();
                            }}
                          />
                          <ChangePasswordDialog
                            userId={u.id}
                            t={t}
                            onSubmit={async (password) => {
                              await updatePasswordFn({ data: { userId: u.id, password } });
                              toast.success(t("superAdmin.toastPasswordUpdated"));
                            }}
                          />
                          {!u.isSuperAdmin && (
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
                                    {t("superAdmin.deleteAccountTitle")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {lang === "ar"
                                      ? `سيتم حذف حساب ${u.email}. تقارير الشركة لن تُحذف.`
                                      : `The account ${u.email} will be deleted. Company reports will not be deleted.`}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteAccountMut.mutate(u.id)}
                                  >
                                    {t("admin.delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
      </main>
    </div>
  );
}

function ChangeNameDialog({
  currentName,
  onSubmit,
  t,
}: {
  currentName: string;
  onSubmit: (name: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onSubmit(name.trim());
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
        if (v) setName(currentName);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.changeNameTitle")}
          className="transition-transform hover:scale-110"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("superAdmin.changeNameTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("superAdmin.newCompanyNameLabel")}
            maxLength={120}
            required
            autoFocus
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
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

function ChangeLogoDialog({
  companyName,
  currentLogoUrl,
  onSubmit,
  t,
}: {
  companyName: string;
  currentLogoUrl: string | null;
  onSubmit: (logoUrl: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t("superAdmin.toastChooseLogo"));
    setLoading(true);
    try {
      const logoUrl = await uploadCompanyLogo(file);
      await onSubmit(logoUrl);
      setOpen(false);
      setFile(null);
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
        if (!v) setFile(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.changeLogoTitle")}
          className="transition-transform hover:scale-110"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{companyName}</DialogTitle>
          <DialogDescription>{t("superAdmin.logoDialogDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {currentLogoUrl && (
            <img
              src={currentLogoUrl}
              alt={companyName}
              className="h-16 w-16 rounded border border-border object-contain"
            />
          )}
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || !file}
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

function ChangePasswordDialog({
  onSubmit,
  t,
}: {
  userId: string;
  onSubmit: (password: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error(t("superAdmin.toastMinPassword"));
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.changePasswordTitle")}
          className="transition-transform hover:scale-110"
        >
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("superAdmin.changePasswordTitle")}</DialogTitle>
          <DialogDescription>{t("superAdmin.changePasswordDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("superAdmin.newPasswordPlaceholder")}
              dir="ltr"
              className="pl-10"
              autoFocus
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

function ChangeEmailDialog({
  currentEmail,
  onSubmit,
  t,
}: {
  userId: string;
  currentEmail: string;
  onSubmit: (email: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(email);
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
        if (v) setEmail(currentEmail);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.changeEmailTitle")}
          className="transition-transform hover:scale-110"
        >
          <Mail className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("superAdmin.changeEmailDialogTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            required
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
