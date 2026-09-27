import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Bell,
  BellOff,
  BellRing,
  Building2,
  Calendar,
  Eye,
  EyeOff,
  FileSignature,
  KeyRound,
  Loader2,
  Lock,
  Megaphone,
  Printer,
  Search,
  User,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LetterDocument, useLetterPrint } from "@/components/letter-document";
import { PushBanner } from "@/components/push-banner";
import { RiderPhoto } from "@/components/rider-photo";
import { UserMenu } from "@/components/user-menu";
import { useRiderPush } from "@/lib/push-client";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { monthLabel } from "@/lib/month-label";
import { HIGHLIGHT_KEYS, pickMetric } from "@/lib/rider-metrics";
import { useLanguage, type Lang, type TranslationKey } from "@/lib/i18n";

const search = z.object({
  reportId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/rider/$iqama")({
  validateSearch: search,
  component: RiderPage,
});

interface RiderMatch {
  rider_id: string;
  rider_name: string | null;
  rider_photo_url: string | null;
  rider_photo_rotation: number;
  rider_area: string | null;
  rider_extra: Record<string, unknown> | null;
  rider_is_blocked: boolean;
  rider_has_password: boolean;
  company_id: string;
  company_name: string;
  company_logo_url: string | null;
}

interface RiderNotification {
  notification_id: string;
  title: string;
  body: string;
  kind: "notification" | "warning";
  created_at: string;
  is_read: boolean;
}

function AlertPopover({
  items,
  icon: Icon,
  titleText,
  emptyText,
  toneClass,
  lang,
  onOpen,
}: {
  items: RiderNotification[];
  icon: LucideIcon;
  titleText: string;
  emptyText: string;
  toneClass: string;
  lang: Lang;
  onOpen: () => void;
}) {
  const unreadCount = items.filter((n) => !n.is_read).length;
  return (
    <Popover onOpenChange={(open) => open && onOpen()}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`relative ${toneClass}`}>
          <Icon className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-4 py-3 text-sm font-semibold">{titleText}</div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          )}
          {items.map((n, i) => (
            <div
              key={n.notification_id}
              className={`border-b px-4 py-3 last:border-b-0 ${!n.is_read ? "bg-primary/5" : ""}`}
              style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{n.title}</span>
                {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {formatDateTime(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Two separate indicators — a warning (إنذار) never gets lost among routine
// notifications since it has its own bell with its own unread count.
function RiderAlertsBar({
  riderId,
  lang,
  t,
}: {
  riderId: string;
  lang: Lang;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["rider-notifications", riderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_rider_notifications", {
        _rider_id: riderId,
      });
      if (error) throw error;
      return (data ?? []) as RiderNotification[];
    },
    refetchInterval: 60_000,
  });

  const all = notificationsQuery.data ?? [];
  const notifications = all.filter((n) => n.kind !== "warning");
  const warnings = all.filter((n) => n.kind === "warning");

  const markRead = (items: RiderNotification[]) => {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.notification_id);
    if (unreadIds.length === 0) return;
    supabase
      .rpc("mark_rider_notifications_read", { _rider_id: riderId, _notification_ids: unreadIds })
      .then(() => queryClient.invalidateQueries({ queryKey: ["rider-notifications", riderId] }));
  };

  return (
    <div className="flex items-center gap-2">
      <AlertPopover
        items={warnings}
        icon={AlertTriangle}
        titleText={t("rider.warningsTitle")}
        emptyText={t("rider.warningsEmpty")}
        toneClass={warnings.some((n) => !n.is_read) ? "border-destructive/50 text-destructive" : ""}
        lang={lang}
        onOpen={() => markRead(warnings)}
      />
      <AlertPopover
        items={notifications}
        icon={Bell}
        titleText={t("rider.notificationsTitle")}
        emptyText={t("rider.notificationsEmpty")}
        toneClass=""
        lang={lang}
        onOpen={() => markRead(notifications)}
      />
    </div>
  );
}

interface RiderLetter {
  letter_id: string;
  title: string;
  body: string;
  letter_date: string;
  include_stamp: boolean;
  include_signature: boolean;
  created_at: string;
  rider_name: string | null;
  company_name: string;
  company_logo_url: string | null;
  company_stamp_url: string | null;
  company_signature_url: string | null;
  company_unified_number: string | null;
  company_commercial_registration: string | null;
}

function RiderLetterDialog({
  letter,
  t,
}: {
  letter: RiderLetter;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const letterNode = (
    <LetterDocument
      t={t}
      assets={{
        companyName: letter.company_name,
        companyLogoUrl: letter.company_logo_url,
        companyStampUrl: letter.company_stamp_url,
        companySignatureUrl: letter.company_signature_url,
        companyUnifiedNumber: letter.company_unified_number,
        companyCommercialRegistration: letter.company_commercial_registration,
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-accent hover:shadow-sm"
        >
          <span className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-muted-foreground" />
            {letter.title}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(letter.letter_date)}</span>
        </button>
      </DialogTrigger>
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

function CompanyLogo({
  url,
  name,
  className,
}: {
  url: string | null;
  name: string;
  className?: string;
}) {
  if (url) {
    return <img src={url} alt={name} className={`rounded object-contain ${className ?? ""}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center rounded bg-primary/10 text-primary ${className ?? ""}`}
    >
      <Building2 className="h-1/2 w-1/2" />
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir="ltr"
        className="pl-10"
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function RiderPasswordDialog({
  riderId,
  hasPassword,
  currentPw,
  open,
  onOpenChange,
  t,
  onDone,
}: {
  riderId: string;
  hasPassword: boolean;
  currentPw: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: TranslationKey) => string;
  onDone: (pw: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  // Only ask for the current password if one is set and we don't already
  // hold it from unlocking this visit.
  const askCurrent = hasPassword && !currentPw;

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 4) return toast.error(t("rider.passwordTooShort"));
    if (next !== confirm) return toast.error(t("rider.passwordMismatch"));
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_rider_password", {
        _rider_id: riderId,
        _new_password: next,
        _current_password: askCurrent ? current : currentPw || undefined,
      });
      if (error) throw error;
      toast.success(t("rider.passwordSaved"));
      onDone(next);
      onOpenChange(false);
      reset();
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
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasPassword ? t("rider.changePasswordButton") : t("rider.setPasswordButton")}
          </DialogTitle>
          <DialogDescription>{t("rider.passwordDialogDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {askCurrent && (
            <div className="space-y-1.5">
              <Label>{t("rider.currentPasswordLabel")}</Label>
              <PasswordField
                value={current}
                onChange={setCurrent}
                placeholder={t("rider.currentPasswordLabel")}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("rider.newPasswordLabel")}</Label>
            <PasswordField
              value={next}
              onChange={setNext}
              placeholder={t("rider.newPasswordLabel")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("rider.confirmPasswordLabel")}</Label>
            <PasswordField
              value={confirm}
              onChange={setConfirm}
              placeholder={t("rider.confirmPasswordLabel")}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("rider.passwordSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RiderPage() {
  const { iqama } = Route.useParams();
  const { reportId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState(iqama);
  // Set when the rider disambiguates between multiple companies sharing
  // this iqama number. Reset whenever the iqama itself changes.
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  // Password the rider typed. Held only for the current search — a fresh
  // lookup clears it, so a protected rider is asked again every time.
  const [pwInput, setPwInput] = useState("");
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [pwChecking, setPwChecking] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  useEffect(() => {
    setSelectedRiderId(null);
    setPwInput("");
    setUnlocked({});
  }, [iqama]);

  const lookupQuery = useQuery({
    queryKey: ["rider-lookup", iqama],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lookup_riders_by_iqama", { _iqama: iqama });
      if (error) throw error;
      return (data ?? []) as RiderMatch[];
    },
  });

  const allMatches = lookupQuery.data ?? [];
  const matches = allMatches.filter((m) => !m.rider_is_blocked);
  // Rows exist for this number but every one of them is blocked.
  const isBlocked = allMatches.length > 0 && matches.length === 0;
  const needsDisambiguation = matches.length > 1 && !selectedRiderId;
  const activeRiderId = selectedRiderId ?? (matches.length === 1 ? matches[0].rider_id : null);
  const activeRider = matches.find((m) => m.rider_id === activeRiderId) ?? null;

  const activePw = activeRiderId ? (unlocked[activeRiderId] ?? "") : "";
  const locked = !!activeRider?.rider_has_password && !activePw;

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRiderId) return;
    const pw = pwInput.trim();
    if (!pw) return;
    setPwChecking(true);
    try {
      const { data, error } = await supabase.rpc("rider_password_ok", {
        _rider_id: activeRiderId,
        _password: pw,
      });
      if (error) throw error;
      if (data === true) {
        setUnlocked((u) => ({ ...u, [activeRiderId]: pw }));
        setPwInput("");
      } else {
        toast.error(t("rider.wrongPassword"));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPwChecking(false);
    }
  };

  const onPasswordSet = (pw: string) => {
    if (!activeRiderId) return;
    setUnlocked((u) => ({ ...u, [activeRiderId]: pw }));
    queryClient.invalidateQueries({ queryKey: ["rider-lookup", iqama] });
  };

  const reportsQuery = useQuery({
    queryKey: ["rider-reports", activeRiderId, locked],
    enabled: !!activeRiderId && !locked,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_rider_reports", {
        _rider_id: activeRiderId!,
        _password: activePw || undefined,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const lettersQuery = useQuery({
    queryKey: ["rider-letters", activeRiderId],
    enabled: !!activeRiderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_rider_letters", {
        _rider_id: activeRiderId!,
      });
      if (error) throw error;
      return (data ?? []) as RiderLetter[];
    },
  });

  const reportData = useQuery({
    queryKey: ["rider-report", activeRiderId, reportId, locked],
    enabled: !!reportId && !!activeRiderId && !locked,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_rider_report", {
        _rider_id: activeRiderId!,
        _report_id: reportId!,
        _password: activePw || undefined,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate({ to: "/rider/$iqama", params: { iqama: q }, search: {} });
  };

  // A rider has no login session — "exit" means dropping everything this
  // visit unlocked and returning to the lookup page.
  const exit = () => {
    queryClient.clear();
    navigate({ to: "/" });
  };
  const canManagePassword = !!activeRider && !needsDisambiguation && !locked;
  const push = useRiderPush(canManagePassword ? activeRider.rider_id : null, activePw);

  // A rider with no password of their own can be looked up by anyone who
  // has their Iqama number — nudge them to set one, every time they show up
  // unprotected. Stops for good the moment they set one, since this only
  // ever fires while rider_has_password is still false.
  useEffect(() => {
    if (!canManagePassword || activeRider!.rider_has_password) return;
    toast(t("rider.setPasswordToastTitle"), {
      description: t("rider.setPasswordToastDesc"),
      duration: 8000,
      action: {
        label: t("rider.setPasswordButton"),
        onClick: () => setPasswordDialogOpen(true),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManagePassword, activeRiderId, activeRider?.rider_has_password]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Decorative drifting blobs — purely visual, so they're pulled out of
          the tab order and frozen for anyone who prefers reduced motion. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="animate-blob absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[oklch(0.6_0.118_184.704)]/20 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="animate-blob absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-[oklch(0.627_0.265_303.9)]/15 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="animate-blob absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-primary/10 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "-10s" }}
        />
      </div>

      <header className="relative border-b border-border/50 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold hover:text-primary">
            <BrandLogo />
            {t("index.headerTitle")}
          </Link>
          {/* <form onSubmit={submit} className="flex flex-1 max-w-md gap-2 mx-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="رقم الإقامة"
                className="pr-9"
              />
            </div>
            <Button type="submit">استعلام</Button>
          </form> */}
          <div className="flex items-center justify-end gap-2">
            {activeRiderId && !isBlocked && (
              <RiderAlertsBar riderId={activeRiderId} lang={lang} t={t} />
            )}
            <UserMenu
              name={activeRider?.rider_name || iqama}
              subtitle={activeRider?.rider_name ? iqama : undefined}
              onSignOut={exit}
            >
              {canManagePassword && push.available && !push.denied && (
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  disabled={push.busy}
                  onClick={push.subscribed ? push.disable : push.enable}
                >
                  {push.subscribed ? (
                    <BellOff className="h-4 w-4" />
                  ) : (
                    <BellRing className="h-4 w-4" />
                  )}
                  {push.subscribed ? t("push.menuDisable") : t("push.menuEnable")}
                </DropdownMenuItem>
              )}
              {canManagePassword && (
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => setPasswordDialogOpen(true)}
                >
                  <KeyRound className="h-4 w-4" />
                  {activeRider.rider_has_password
                    ? t("rider.changePasswordButton")
                    : t("rider.setPasswordButton")}
                </DropdownMenuItem>
              )}
            </UserMenu>
          </div>
        </div>
      </header>

      {canManagePassword && (
        <RiderPasswordDialog
          riderId={activeRider.rider_id}
          hasPassword={activeRider.rider_has_password}
          currentPw={activePw}
          open={passwordDialogOpen}
          onOpenChange={setPasswordDialogOpen}
          t={t}
          onDone={onPasswordSet}
        />
      )}

      <main className="relative mx-auto max-w-6xl px-6 py-8">
        {canManagePassword && <PushBanner push={push} />}

        {lookupQuery.isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!lookupQuery.isLoading && allMatches.length === 0 && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-md text-center duration-500">
            <CardContent className="pt-8 pb-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">{t("rider.notFoundTitle")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("rider.notFoundDesc")} <span className="font-mono">{iqama}</span>
              </p>
            </CardContent>
          </Card>
        )}

        {!lookupQuery.isLoading && isBlocked && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-md border-destructive/30 text-center duration-500">
            <CardContent className="pt-8 pb-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Ban className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">{t("rider.blockedTitle")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("rider.blockedDesc")}</p>
            </CardContent>
          </Card>
        )}

        {needsDisambiguation && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-md duration-500">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-6 w-6" />
              </div>
              <CardTitle>{t("rider.multipleResultsTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("rider.multipleResultsDesc")}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {matches.map((m) => (
                <button
                  key={m.rider_id}
                  type="button"
                  onClick={() => setSelectedRiderId(m.rider_id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-accent hover:shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <CompanyLogo
                      url={m.company_logo_url}
                      name={m.company_name}
                      className="h-6 w-6"
                    />
                    <span className="font-medium">{m.company_name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{m.rider_name || "—"}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {activeRider && !needsDisambiguation && locked && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-md border-primary/20 duration-500">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="h-6 w-6" />
              </div>
              <CardTitle>{t("rider.passwordGateTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("rider.passwordGateDesc")}</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={verifyPassword} className="space-y-3">
                <PasswordField
                  value={pwInput}
                  onChange={setPwInput}
                  placeholder={t("rider.passwordLabel")}
                  autoFocus
                />
                <Button type="submit" className="w-full" disabled={pwChecking || !pwInput.trim()}>
                  {pwChecking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("rider.unlockButton")
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {activeRider && !needsDisambiguation && !locked && (
          <div className="animate-in fade-in slide-in-from-bottom-2 grid gap-6 duration-500 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-4">
              {activeRider.company_name && (
                <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="flex items-center gap-4 pt-6">
                    <CompanyLogo
                      url={activeRider.company_logo_url}
                      name={activeRider.company_name}
                      className="h-16 w-16 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{t("rider.companyLabel")}</div>
                      <div className="truncate text-lg font-bold">{activeRider.company_name}</div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    {activeRider.rider_photo_url ? (
                      <RiderPhoto
                        riderId={activeRider.rider_id}
                        src={activeRider.rider_photo_url}
                        alt={activeRider.rider_name ?? ""}
                        rotation={activeRider.rider_photo_rotation}
                        className="h-14 w-14 shrink-0 rounded-full border border-border"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-6 w-6" />
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-muted-foreground">{t("rider.riderLabel")}</div>
                      <div className="font-semibold">{activeRider.rider_name || "—"}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">{t("rider.iqamaLabel")}</div>
                  <div className="font-mono text-sm">{iqama}</div>
                  {activeRider.rider_area && (
                    <>
                      <div className="mt-3 text-xs text-muted-foreground">
                        {t("rider.areaLabel")}
                      </div>
                      <div className="text-sm font-medium">{activeRider.rider_area}</div>
                    </>
                  )}
                  {matches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSelectedRiderId(null)}
                      className="mt-2 text-xs text-primary transition-colors hover:underline"
                    >
                      {t("rider.changeCompany")}
                    </button>
                  )}
                  {activeRider.rider_extra && Object.keys(activeRider.rider_extra).length > 0 && (
                    <div className="mt-4 space-y-1.5 border-t pt-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t("rider.riderInfo")}
                      </div>
                      {Object.entries(activeRider.rider_extra).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="text-end font-medium break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t("rider.monthsAvailable")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {reportsQuery.isLoading && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {reportsQuery.data && reportsQuery.data.length === 0 && (
                    <div className="text-sm text-muted-foreground">{t("rider.noReports")}</div>
                  )}
                  {reportsQuery.data?.map((r, i) => {
                    const active = reportId === r.report_id;
                    return (
                      <Link
                        key={r.report_id}
                        to="/rider/$iqama"
                        params={{ iqama }}
                        search={{ reportId: r.report_id }}
                        className={`animate-in fade-in slide-in-from-bottom-1 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all duration-300 fill-mode-[backwards] ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border hover:-translate-y-0.5 hover:bg-accent hover:shadow-sm"
                        }`}
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        <span className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {monthLabel(r.month, r.year, lang)}
                        </span>
                        {active && <Badge variant="secondary">{t("rider.openBadge")}</Badge>}
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>

              {lettersQuery.data && lettersQuery.data.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t("rider.lettersTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {lettersQuery.data.map((l) => (
                      <RiderLetterDialog key={l.letter_id} letter={l} t={t} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </aside>

            <section>
              {!reportId && (
                <Card>
                  <CardContent className="py-20 text-center">
                    <Calendar className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">{t("rider.chooseMonthTitle")}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("rider.chooseMonthDesc")}
                    </p>
                  </CardContent>
                </Card>
              )}
              {reportId && reportData.isLoading && (
                <div className="flex justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {reportId && reportData.data && (
                <ReportView
                  data={reportData.data as unknown as RiderReportView}
                  lang={lang}
                  t={t}
                />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

interface RiderReportView {
  data: Record<string, unknown>;
  columns: string[];
  month: number;
  year: number;
  file_name: string;
  note: string | null;
}

function ReportView({
  data,
  lang,
  t,
}: {
  data: RiderReportView;
  lang: Lang;
  t: (key: TranslationKey) => string;
}) {
  const rowData = data.data;
  const columns = useMemo(() => {
    if (Array.isArray(data.columns) && data.columns.length > 0) return data.columns;
    return Object.keys(rowData);
  }, [data.columns, rowData]);

  const metrics = [
    { label: t("rider.metricTotal"), metric: pickMetric(rowData, HIGHLIGHT_KEYS.total) },
    { label: t("rider.metricHours"), metric: pickMetric(rowData, HIGHLIGHT_KEYS.hours) },
    { label: t("rider.metricSalary"), metric: pickMetric(rowData, HIGHLIGHT_KEYS.salary) },
  ].filter((m) => m.metric);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{t("rider.reportLabel")}</div>
          <h2 className="text-2xl font-bold">{monthLabel(data.month, data.year, lang)}</h2>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {data.file_name}
        </Badge>
      </div>

      {data.note && (
        <Card className="animate-in fade-in slide-in-from-bottom-1 border-primary/30 bg-primary/5 duration-500">
          <CardContent className="flex items-start gap-3 pt-6">
            <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="text-xs font-medium text-primary">{t("rider.noteTitle")}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{data.note}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {metrics.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m, i) => (
            <Card
              key={i}
              className="animate-in fade-in slide-in-from-bottom-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent fill-mode-[backwards] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-md"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">{m.label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {String(m.metric!.value)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{m.metric!.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rider.allMonthData")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((col) => {
              const val = rowData[col];
              if (val === undefined || val === null || val === "") return null;
              return (
                <div
                  key={col}
                  className="rounded-lg border border-border/60 bg-background p-3 transition-colors hover:border-primary/30 hover:bg-accent/40"
                >
                  <div className="text-xs text-muted-foreground">{col}</div>
                  <div className="mt-1 truncate font-medium tabular-nums" title={String(val)}>
                    {String(val)}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
