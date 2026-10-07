import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Loader2,
  Trash2,
  Plus,
  Users,
  KeyRound,
  Mail,
  MoreVertical,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  listCompanies,
  updateAccountEmail,
  updateAccountPassword,
} from "@/lib/accounts.functions";
import { formatDate } from "@/lib/date-format";
import { useLanguage, type Lang, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/super-admin/accounts")({
  component: AccountsPage,
});

interface AccountRow {
  id: string;
  email: string | null;
  displayName: string | null;
  lastSignInAt: string | null;
  role: "admin" | "user";
  companyId: string | null;
  companyName: string | null;
  isSuperAdmin: boolean;
}

function AccountsPage() {
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();
  const listCompaniesFn = useServerFn(listCompanies);
  const listAccountsFn = useServerFn(listAccounts);
  const createAccountFn = useServerFn(createAccount);
  const deleteAccountFn = useServerFn(deleteAccount);
  const updatePasswordFn = useServerFn(updateAccountPassword);
  const updateEmailFn = useServerFn(updateAccountEmail);

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => listCompaniesFn(),
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccountsFn(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const companyLogoById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of companies.data ?? []) map.set(c.id, c.logo_url);
    return map;
  }, [companies.data]);

  // Every account grouped under its company, so a company's admin and the
  // staff it created always sit together instead of scattered across the
  // list by creation date. Super admins aren't tied to a company, so they
  // get their own group at the end.
  const { companyGroups, superAdmins } = useMemo(() => {
    const byCompany = new Map<string, AccountRow[]>();
    const supers: AccountRow[] = [];
    for (const u of accounts.data ?? []) {
      if (u.isSuperAdmin) {
        supers.push(u);
        continue;
      }
      if (!u.companyId) continue;
      const list = byCompany.get(u.companyId) ?? [];
      list.push(u);
      byCompany.set(u.companyId, list);
    }
    const groups = [...byCompany.entries()]
      .map(([companyId, list]) => ({
        companyId,
        companyName: list[0].companyName ?? "—",
        logoUrl: companyLogoById.get(companyId) ?? null,
        // The company's own admin first, then its staff (already newest first).
        accounts: [...list].sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1)),
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName, lang === "ar" ? "ar" : "en"));
    return { companyGroups: groups, superAdmins: supers };
  }, [accounts.data, companyLogoById, lang]);

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

  return (
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
          <div className="space-y-4">
            {companyGroups.map((group, i) => (
              <div
                key={group.companyId}
                className="animate-in fade-in slide-in-from-bottom-1 overflow-hidden rounded-xl border duration-300 fill-mode-[backwards]"
                style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
              >
                <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                  {group.logoUrl ? (
                    <img
                      src={group.logoUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-semibold">{group.companyName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    ({group.accounts.length})
                  </span>
                </div>
                <div className="divide-y">
                  {group.accounts.map((u) => (
                    <AccountRowItem
                      key={u.id}
                      account={u}
                      t={t}
                      lang={lang}
                      onUpdateEmail={async (email) => {
                        await updateEmailFn({ data: { userId: u.id, email } });
                        toast.success(t("superAdmin.toastEmailUpdated"));
                        invalidate();
                      }}
                      onUpdatePassword={async (password) => {
                        await updatePasswordFn({ data: { userId: u.id, password } });
                        toast.success(t("superAdmin.toastPasswordUpdated"));
                      }}
                      onDelete={() => deleteAccountMut.mutate(u.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {superAdmins.length > 0 && (
              <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    {t("superAdmin.superAdminsGroupTitle")}
                  </span>
                </div>
                <div className="divide-y">
                  {superAdmins.map((u) => (
                    <AccountRowItem
                      key={u.id}
                      account={u}
                      t={t}
                      lang={lang}
                      onUpdateEmail={async (email) => {
                        await updateEmailFn({ data: { userId: u.id, email } });
                        toast.success(t("superAdmin.toastEmailUpdated"));
                        invalidate();
                      }}
                      onUpdatePassword={async (password) => {
                        await updatePasswordFn({ data: { userId: u.id, password } });
                        toast.success(t("superAdmin.toastPasswordUpdated"));
                      }}
                      onDelete={() => deleteAccountMut.mutate(u.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// One account within its company's (or the super-admins') group — name,
// role badge, email and last sign-in on one line, actions on the other side.
function AccountRowItem({
  account,
  t,
  lang,
  onUpdateEmail,
  onUpdatePassword,
  onDelete,
}: {
  account: AccountRow;
  t: (key: TranslationKey) => string;
  lang: Lang;
  onUpdateEmail: (email: string) => Promise<void>;
  onUpdatePassword: (password: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{account.displayName || "—"}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {account.isSuperAdmin
              ? t("superAdmin.superAdminBadge")
              : account.role === "user"
                ? t("superAdmin.staffBadge")
                : t("superAdmin.companyAdminBadge")}
          </Badge>
        </div>
        <div className="truncate text-xs text-muted-foreground" dir="ltr">
          {account.email}
        </div>
      </div>
      <div className="shrink-0 text-xs text-muted-foreground">
        {account.lastSignInAt ? formatDate(account.lastSignInAt) : t("superAdmin.neverLoggedIn")}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEmailOpen(true)}>
            <Mail className="h-3.5 w-3.5" />
            {t("superAdmin.changeEmailTitle")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            {t("superAdmin.changePasswordTitle")}
          </DropdownMenuItem>
          {!account.isSuperAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmDeleteOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("admin.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangeEmailDialog
        userId={account.id}
        currentEmail={account.email ?? ""}
        t={t}
        onSubmit={onUpdateEmail}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />
      <ChangePasswordDialog
        userId={account.id}
        t={t}
        onSubmit={onUpdatePassword}
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
      {!account.isSuperAdmin && (
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("superAdmin.deleteAccountTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "ar"
                  ? `سيتم حذف حساب ${account.email}. تقارير الشركة لن تُحذف.`
                  : `The account ${account.email} will be deleted. Company reports will not be deleted.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                {t("admin.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function ChangePasswordDialog({
  onSubmit,
  t,
  open,
  onOpenChange,
}: {
  userId: string;
  onSubmit: (password: string) => Promise<void>;
  t: (key: TranslationKey) => string;
  // Opened from the row's "⋮" menu, not its own trigger button.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error(t("superAdmin.toastMinPassword"));
    setLoading(true);
    try {
      await onSubmit(password);
      onOpenChange(false);
      setPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  open,
  onOpenChange,
}: {
  userId: string;
  currentEmail: string;
  onSubmit: (email: string) => Promise<void>;
  t: (key: TranslationKey) => string;
  // Opened from the row's "⋮" menu, not its own trigger button.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState(currentEmail);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(email);
      onOpenChange(false);
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
        onOpenChange(v);
        if (v) setEmail(currentEmail);
      }}
    >
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
