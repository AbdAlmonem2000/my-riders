import {
  createFileRoute,
  Link,
  Navigate,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bell,
  Building2,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Home,
  Landmark,
  Loader2,
  Lock,
  Megaphone,
  PanelLeftClose,
  User,
  UserCog,
  Users,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { NAV_LINK_ACTIVE_CLASS, NAV_LINK_CLASS } from "@/components/nav-link-styles";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { UserMenu } from "@/components/user-menu";
import { checkIsAdmin } from "@/lib/reports.functions";
import { computeDocStatus } from "@/lib/document-status";
import { formatDateTime } from "@/lib/date-format";
import { listAnnouncements, markAnnouncementsRead } from "@/lib/announcements.functions";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

const SIDEBAR_STORAGE_KEY = "admin-sidebar-open";

function readStoredSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
}

function NotificationBell({
  announcements,
  unreadCount,
  t,
  onOpen,
}: {
  announcements: AnnouncementItem[];
  unreadCount: number;
  t: (key: TranslationKey) => string;
  onOpen: () => void;
}) {
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {t("admin.notificationsTitle")}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {announcements.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("admin.notificationsEmpty")}
            </p>
          )}
          {announcements.map((a, i) => (
            <div
              key={a.id}
              className={`border-b px-4 py-3 last:border-b-0 ${!a.isRead ? "bg-primary/5" : ""}`}
              style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{a.title}</span>
                {!a.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {formatDateTime(a.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const NAV_TABS = [
  { to: "/admin" as const, key: "admin.navOverview" as const, icon: Home, exact: true },
  { to: "/admin/riders" as const, key: "admin.navRiders" as const, icon: Users, exact: false },
  {
    to: "/admin/reports" as const,
    key: "admin.navReports" as const,
    icon: FileSpreadsheet,
    exact: false,
  },
  {
    to: "/admin/documents" as const,
    key: "admin.navDocuments" as const,
    icon: FileText,
    exact: false,
  },
  {
    to: "/admin/notifications" as const,
    key: "admin.navNotifications" as const,
    icon: Megaphone,
    exact: false,
  },
  {
    to: "/admin/letters" as const,
    key: "admin.navLetters" as const,
    icon: FileSignature,
    exact: false,
  },
  {
    to: "/admin/users" as const,
    key: "admin.navUsers" as const,
    icon: UserCog,
    exact: false,
  },
  {
    to: "/admin/company-profile" as const,
    key: "admin.navCompanyProfile" as const,
    icon: Landmark,
    exact: false,
  },
  {
    to: "/admin/account" as const,
    key: "admin.navAccount" as const,
    icon: User,
    exact: false,
  },
];

// checkIsAdmin resolves these fields identically for both roles: for a
// real company admin they ARE the company's plan (set only by the super
// admin — see accounts.functions.ts and the super-admin companies page); for a staff account
// they're already the intersection of the company's plan and that staff
// member's own personal permission. So the same page-access map below gates
// both — an admin whose company plan doesn't include, say, Riders sees
// exactly what a staff account without riders_access would see.
//
// Notifications, Users and Company Profile are different: staff never gets
// them regardless of plan (no personal permission exists for these), so
// their gates also require !isStaff — a company's plan can only ever turn
// them OFF for its own admin, never ON for staff.
interface PagePermissions {
  isStaff: boolean;
  overviewAccess: boolean;
  ridersAccess: "none" | "view" | "full";
  reportsAccess: "none" | "view" | "full";
  documentsAccess: "none" | "view_only" | "full";
  lettersAccess: "none" | "view" | "full";
  notificationsAccess: boolean;
  usersAccess: boolean;
  companyProfileAccess: boolean;
}
const PAGE_ACCESS: Record<string, (d: PagePermissions) => boolean> = {
  "/admin": (d) => d.overviewAccess,
  "/admin/riders": (d) => d.ridersAccess !== "none",
  "/admin/reports": (d) => d.reportsAccess !== "none",
  "/admin/documents": (d) => d.documentsAccess !== "none",
  "/admin/letters": (d) => d.lettersAccess !== "none",
  "/admin/notifications": (d) => !d.isStaff && d.notificationsAccess,
  "/admin/users": (d) => !d.isStaff && d.usersAccess,
  "/admin/company-profile": (d) => !d.isStaff && d.companyProfileAccess,
};

function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const listAnnouncementsFn = useServerFn(listAnnouncements);
  const markAnnouncementsReadFn = useServerFn(markAnnouncementsRead);
  const [sidebarOpen, setSidebarOpen] = useState(readStoredSidebarOpen);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* private browsing — not persisted, still toggles for this visit */
      }
      return next;
    });
  };

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });

  const isStaff = !!adminCheck.data?.isStaff;

  const announcementsQuery = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncementsFn(),
    enabled: !!adminCheck.data?.isAdmin && !isStaff,
    refetchInterval: 60_000,
  });

  // Powers the small "expiring soon" badge on the Documents nav item — no
  // extra click needed to know something needs attention.
  const expiringDocsQuery = useQuery({
    queryKey: ["rider-documents-expiring"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rider_documents").select("expiry_date");
      if (error) throw error;
      return data;
    },
    enabled: !!adminCheck.data?.isAdmin,
    refetchInterval: 5 * 60_000,
  });
  const expiringDocsCount = useMemo(
    () =>
      (expiringDocsQuery.data ?? []).filter((d) => computeDocStatus(d.expiry_date).status !== "ok")
        .length,
    [expiringDocsQuery.data],
  );

  // Same idea, for the company's own official documents (commercial
  // register, tax certificate, ...) — badges the Company Profile nav item.
  const expiringCompanyDocsQuery = useQuery({
    queryKey: ["company-documents-expiring"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_documents").select("expiry_date");
      if (error) throw error;
      return data;
    },
    enabled: !!adminCheck.data?.isAdmin && !isStaff,
    refetchInterval: 5 * 60_000,
  });
  const expiringCompanyDocsCount = useMemo(
    () =>
      (expiringCompanyDocsQuery.data ?? []).filter(
        (d) => computeDocStatus(d.expiry_date).status !== "ok",
      ).length,
    [expiringCompanyDocsQuery.data],
  );

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (adminCheck.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (adminCheck.data?.isSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  if (!adminCheck.data?.isAdmin || !adminCheck.data?.companyId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="animate-in fade-in slide-in-from-bottom-2 max-w-md duration-500">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold">{t("admin.unauthorizedTitle")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.unauthorizedDesc")}</p>
            <Button variant="outline" className="mt-4" onClick={signOut}>
              {t("admin.signOutButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // "My account" lives in the sidebar for staff (their one place to see
  // their own info/permissions and change their password) but not for real
  // admins, who already manage that through Company Profile.
  const visibleNavTabs = NAV_TABS.filter((tab) => {
    if (tab.to === "/admin/account") return isStaff;
    const gate = PAGE_ACCESS[tab.to];
    return gate ? gate(adminCheck.data!) : !isStaff;
  });

  // Both admins and staff only see the pages their (plan-intersected)
  // permissions grant — bounce them to the first one they have if they
  // land anywhere else.
  const currentPageAllowed =
    pathname === "/admin/account"
      ? isStaff
      : (PAGE_ACCESS[pathname]?.(adminCheck.data) ?? !isStaff);
  if (!currentPageAllowed) {
    const fallback = visibleNavTabs[0]?.to;
    if (fallback) return <Navigate to={fallback} replace />;
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="animate-in fade-in slide-in-from-bottom-2 max-w-md duration-500">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold">{t("admin.noPermissionsTitle")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.noPermissionsDesc")}</p>
            <Button variant="outline" className="mt-4" onClick={signOut}>
              {t("admin.signOutButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (adminCheck.data.isSuspended) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="animate-in fade-in slide-in-from-bottom-2 max-w-md duration-500">
          <CardContent className="pt-6 text-center">
            <Lock className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold">{t("admin.suspendedTitle")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.suspendedDesc")}</p>
            <Button variant="outline" className="mt-4" onClick={signOut}>
              {t("admin.signOutButton")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const companyName = adminCheck.data.companyName;
  const companyLogoUrl = adminCheck.data.companyLogoUrl;
  const email = user.email ?? "";

  // `collapsed` is the desktop icon-only sidebar; the mobile drawer always
  // shows full labels.
  const renderNavLink = (tab: (typeof NAV_TABS)[number], collapsed: boolean) => {
    const badgeCount =
      tab.to === "/admin/documents"
        ? expiringDocsCount
        : tab.to === "/admin/company-profile"
          ? expiringCompanyDocsCount
          : 0;
    const badgeTooltipKey =
      tab.to === "/admin/company-profile"
        ? ("companyProfile.expiringBadgeTooltip" as const)
        : ("documents.expiringBadgeTooltip" as const);
    return (
      <Link
        key={tab.to}
        to={tab.to}
        activeOptions={{ exact: tab.exact }}
        title={
          collapsed
            ? badgeCount > 0
              ? `${t(tab.key)} · ${t(badgeTooltipKey)} (${badgeCount})`
              : t(tab.key)
            : undefined
        }
        className={`${NAV_LINK_CLASS} ${collapsed ? "justify-center" : ""}`}
        activeProps={{ className: NAV_LINK_ACTIVE_CLASS }}
      >
        <span className="relative shrink-0">
          <tab.icon className="h-4 w-4" />
          {badgeCount > 0 && (
            <span
              title={t(badgeTooltipKey)}
              className="absolute -end-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground"
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </span>
        <span
          className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
            collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100"
          }`}
        >
          {t(tab.key)}
        </span>
      </Link>
    );
  };

  return (
    <div className="relative min-h-screen bg-muted/30">
      {/* overflow-hidden lives on the blob layer itself, not here — putting it
          on this wrapper would make the sidebar's position:sticky treat this
          div as its scroll container instead of the page, breaking the
          "stays put while scrolling" behavior entirely. */}
      {/* Decorative drifting blobs — purely visual, so they're pulled out of
          the tab order and frozen for anyone who prefers reduced motion.
          Fixed so they stay put behind the sidebar/content while scrolling. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="animate-blob absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[oklch(0.6_0.118_184.704)]/15 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="animate-blob absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-[oklch(0.627_0.265_303.9)]/10 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="animate-blob absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-primary/10 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "-10s" }}
        />
      </div>

      <header className="relative border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 md:gap-4">
            <MobileNavDrawer title={companyName ?? t("admin.headerTitle")}>
              {visibleNavTabs.map((tab) => renderNavLink(tab, false))}
            </MobileNavDrawer>
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={companyName ?? ""}
                className="h-14 w-14 shrink-0 rounded-xl border border-border bg-background object-contain p-1"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-7 w-7" />
              </div>
            )}
            <h1 className="text-lg font-semibold">{companyName ?? t("admin.headerTitle")}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isStaff && (
              <NotificationBell
                announcements={announcementsQuery.data?.announcements ?? []}
                unreadCount={announcementsQuery.data?.unreadCount ?? 0}
                t={t}
                onOpen={() => {
                  const unreadIds = (announcementsQuery.data?.announcements ?? [])
                    .filter((a) => !a.isRead)
                    .map((a) => a.id);
                  if (unreadIds.length === 0) return;
                  markAnnouncementsReadFn({ data: { ids: unreadIds } }).then(() =>
                    queryClient.invalidateQueries({ queryKey: ["announcements"] }),
                  );
                }}
              />
            )}
            <UserMenu
              name={adminCheck.data?.displayName || email.split("@")[0] || email}
              subtitle={email}
              onSignOut={signOut}
            >
              <DropdownMenuItem asChild className="cursor-pointer gap-2">
                {isStaff ? (
                  <Link to="/admin/account">
                    <UserCog className="h-4 w-4" />
                    {t("admin.navAccount")}
                  </Link>
                ) : (
                  <Link to="/admin/company-profile">
                    <Landmark className="h-4 w-4" />
                    {t("admin.navCompanyProfile")}
                  </Link>
                )}
              </DropdownMenuItem>
            </UserMenu>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl gap-6 p-4 md:flex md:items-start md:p-6">
        <aside
          className={`hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out md:sticky md:top-6 md:block ${
            sidebarOpen ? "md:w-56" : "md:w-14"
          }`}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarOpen ? t("admin.hideSidebar") : t("admin.showSidebar")}
            className={`mb-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:bg-accent hover:text-foreground ${
              sidebarOpen ? "justify-between" : "justify-center"
            }`}
          >
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                sidebarOpen ? "max-w-32 opacity-100" : "max-w-0 opacity-0"
              }`}
            >
              {t("admin.hideSidebar")}
            </span>
            <PanelLeftClose
              className={`h-4 w-4 shrink-0 transition-transform duration-300 ease-in-out ${
                sidebarOpen ? "" : "rotate-180"
              }`}
            />
          </button>

          <nav className="flex flex-col gap-1 p-1">
            {visibleNavTabs.map((tab) => renderNavLink(tab, !sidebarOpen))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
