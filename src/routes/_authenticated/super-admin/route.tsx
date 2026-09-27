import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Megaphone, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NAV_LINK_ACTIVE_CLASS, NAV_LINK_CLASS } from "@/components/nav-link-styles";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { UserMenu } from "@/components/user-menu";
import { checkIsAdmin } from "@/lib/reports.functions";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminLayout,
});

const NAV_TABS = [
  {
    to: "/super-admin" as const,
    key: "superAdmin.navCompanies" as const,
    icon: Building2,
    exact: true,
  },
  {
    to: "/super-admin/accounts" as const,
    key: "superAdmin.navAccounts" as const,
    icon: Users,
    exact: false,
  },
  {
    to: "/super-admin/announcements" as const,
    key: "superAdmin.navAnnouncements" as const,
    icon: Megaphone,
    exact: false,
  },
];

function SuperAdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);

  const check = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn() });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

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
            <div className="mt-4 flex justify-center gap-2">
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

  const email = user.email ?? "";

  const navLinks = NAV_TABS.map((tab) => (
    <Link
      key={tab.to}
      to={tab.to}
      activeOptions={{ exact: tab.exact }}
      className={NAV_LINK_CLASS}
      activeProps={{ className: NAV_LINK_ACTIVE_CLASS }}
    >
      <tab.icon className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">{t(tab.key)}</span>
    </Link>
  ));

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
          <div className="flex items-center gap-3">
            <MobileNavDrawer title={t("superAdmin.headerTitle")}>{navLinks}</MobileNavDrawer>
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {t("superAdmin.headerTitle")}
              </h1>
              <p className="text-xs text-muted-foreground">{t("superAdmin.headerSubtitle")}</p>
            </div>
          </div>
          <UserMenu name={email.split("@")[0] || email} subtitle={email} onSignOut={signOut} />
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl gap-6 p-4 md:flex md:items-start md:p-6">
        <aside className="hidden shrink-0 md:sticky md:top-6 md:block md:w-56">
          <nav className="flex flex-col gap-1 p-1">{navLinks}</nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
