import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  DollarSign,
  Gift,
  Loader2,
  Receipt,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { listCompaniesForPayments, listCompanyPayments } from "@/lib/payments.functions";
import { MONTH_NAMES_AR, MONTH_NAMES_EN, monthLabel } from "@/lib/month-label";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  component: DashboardPage,
});

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// Same hues PaymentCell (payments.tsx) uses for the same four states, so
// this chart reads as one system with the grid it's summarizing rather
// than introducing its own palette. "unpaid" reuses the StatCard "down"
// tone's amber instead of the destructive red — a company that hasn't
// paid yet this month isn't an error state the way a failed action is.
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  cash: "#059669",
  transfer: "#0284c7",
  free: "#7c3aed",
  unpaid: "#d97706",
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "up" | "down";
  delay?: number;
}) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards] transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div
            className={
              "mt-1 text-2xl font-bold " +
              (tone === "up" ? "text-emerald-600" : tone === "down" ? "text-amber-600" : "")
            }
          >
            {value}
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

// How the selected month's monthly-plan companies break down: paid in
// cash, paid by transfer, given free, or not paid yet. Purely a visual
// second view of the same four numbers the stat cards above already show.
function PaymentStatusDonut({
  cashCount,
  transferCount,
  freeCount,
  unpaidCount,
  t,
}: {
  cashCount: number;
  transferCount: number;
  freeCount: number;
  unpaidCount: number;
  t: (key: TranslationKey) => string;
}) {
  const data = [
    { key: "cash", label: t("superAdmin.paymentsCashBadge"), value: cashCount },
    { key: "transfer", label: t("superAdmin.paymentsTransferBadge"), value: transferCount },
    { key: "free", label: t("superAdmin.paymentsFreeBadge"), value: freeCount },
    { key: "unpaid", label: t("superAdmin.dashboardUnpaidThisMonth"), value: unpaidCount },
  ].filter((d) => d.value > 0);
  const total = cashCount + transferCount + freeCount + unpaidCount;
  const config: ChartConfig = { value: { label: t("superAdmin.paymentsCompaniesCountSuffix") } };

  return (
    <div className="relative flex h-48 items-center justify-center">
      {total === 0 ? (
        <span className="text-xs text-muted-foreground">
          {t("superAdmin.dashboardNoMonthlyCompanies")}
        </span>
      ) : (
        <>
          <ChartContainer config={config} className="aspect-auto h-48 w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="58%"
                outerRadius="90%"
                paddingAngle={2}
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.key} fill={PAYMENT_STATUS_COLORS[d.key]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums">{total}</span>
            <span className="text-[10px] text-muted-foreground">
              {t("superAdmin.dashboardTotalCompanies")}
            </span>
          </div>
        </>
      )}
      {total > 0 && (
        <div className="absolute bottom-0 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {data.map((d) => (
            <span key={d.key} className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: PAYMENT_STATUS_COLORS[d.key] }}
              />
              {d.label} ({d.value})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Total money actually collected per month across the selected year —
// monthly cash/transfer payments plus any first-payment or one-time
// payment that landed in that month — independent of which single month
// the stat cards above are focused on, so the trend is always the whole
// year at a glance.
function MonthlyCollectedTrendChart({
  data,
  t,
}: {
  data: { label: string; value: number }[];
  t: (key: TranslationKey) => string;
}) {
  const config: ChartConfig = { value: { label: t("superAdmin.dashboardCollectedRevenue") } };

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#059669"
          strokeWidth={2}
          dot={{ r: 3, fill: "#059669" }}
        >
          <LabelList dataKey="value" position="top" fontSize={11} className="fill-foreground" />
        </Line>
      </LineChart>
    </ChartContainer>
  );
}

function DashboardPage() {
  const { t, lang } = useLanguage();
  const listCompaniesFn = useServerFn(listCompaniesForPayments);
  const listPaymentsFn = useServerFn(listCompanyPayments);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) list.push(y);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const monthNames = lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_AR;

  const companiesQuery = useQuery({
    queryKey: ["companies-payments"],
    queryFn: () => listCompaniesFn(),
  });
  const paymentsQuery = useQuery({
    queryKey: ["company-payments", year],
    queryFn: () => listPaymentsFn({ data: { year } }),
  });

  const isLoading = companiesQuery.isLoading || paymentsQuery.isLoading;
  const loadError = companiesQuery.error ?? paymentsQuery.error;
  const companies = useMemo(() => companiesQuery.data ?? [], [companiesQuery.data]);

  const stats = useMemo(() => {
    const paidThisMonth = new Map(
      (paymentsQuery.data ?? [])
        .filter((p) => p.month === month)
        .map((p) => [p.company_id, p.payment_type as "cash" | "transfer" | "free"]),
    );

    const monthly = companies.filter((c) => c.payment_plan_type === "monthly");
    const exemptCount = companies.filter((c) => c.payment_plan_type === "exempt").length;

    let expectedRevenue = 0;
    let collectedRevenue = 0;
    let cashCount = 0;
    let transferCount = 0;
    let freeCount = 0;
    let firstPaymentTotal = 0;
    const unpaid: typeof monthly = [];

    for (const c of monthly) {
      if (c.monthly_fee != null) expectedRevenue += c.monthly_fee;
      const paymentType = paidThisMonth.get(c.id);
      if (paymentType === "cash") {
        cashCount++;
        if (c.monthly_fee != null) collectedRevenue += c.monthly_fee;
      } else if (paymentType === "transfer") {
        transferCount++;
        if (c.monthly_fee != null) collectedRevenue += c.monthly_fee;
      } else if (paymentType === "free") {
        freeCount++;
      } else {
        unpaid.push(c);
      }
      // A first payment (onboarding fee) only counts toward the one
      // specific month it actually happened in — not every month.
      if (c.first_payment_month === month && c.first_payment_year === year) {
        firstPaymentTotal += c.first_payment_fee ?? 0;
      }
    }

    // Same idea for a one-time plan company's lump sum — it only belongs
    // to the one month it was scheduled for, and (like a monthly company's
    // fee) only counts as collected once actually marked cash/transfer.
    const oneTimeThisMonth = companies.filter(
      (c) =>
        c.payment_plan_type === "one_time" &&
        c.one_time_payment_month === month &&
        c.one_time_payment_year === year,
    );
    const oneTimePaidThisMonth = oneTimeThisMonth.filter((c) => {
      const paymentType = paidThisMonth.get(c.id);
      return paymentType === "cash" || paymentType === "transfer";
    });
    const oneTimeTotal = oneTimePaidThisMonth.reduce((sum, c) => sum + (c.one_time_fee ?? 0), 0);

    return {
      total: companies.length,
      monthlyCount: monthly.length,
      exemptCount,
      oneTimeCount: oneTimePaidThisMonth.length,
      oneTimeTotal,
      firstPaymentTotal,
      cashCount,
      transferCount,
      freeCount,
      paidCount: cashCount + transferCount + freeCount,
      unpaidCount: unpaid.length,
      expectedRevenue,
      collectedRevenue,
      totalCollected: collectedRevenue + firstPaymentTotal + oneTimeTotal,
      unpaid,
    };
  }, [companies, paymentsQuery.data, month, year]);

  // The whole selected year's collected total, one point per month —
  // independent of the month filter above.
  const monthlyTrend = useMemo(() => {
    const monthlyCompanies = companies.filter((c) => c.payment_plan_type === "monthly");
    const byMonth = new Map(
      MONTHS.map((m) => [
        m,
        (paymentsQuery.data ?? [])
          .filter((p) => p.month === m && p.payment_type !== "free")
          .map((p) => p.company_id),
      ]),
    );
    const companyById = new Map(companies.map((c) => [c.id, c]));
    const paidCompanyMonths = new Set(
      (paymentsQuery.data ?? [])
        .filter((p) => p.payment_type === "cash" || p.payment_type === "transfer")
        .map((p) => `${p.company_id}:${p.month}`),
    );

    return MONTHS.map((m) => {
      let value = 0;
      for (const companyId of byMonth.get(m) ?? []) {
        const c = companyById.get(companyId);
        if (c?.monthly_fee != null) value += c.monthly_fee;
      }
      for (const c of monthlyCompanies) {
        if (c.first_payment_month === m && c.first_payment_year === year) {
          value += c.first_payment_fee ?? 0;
        }
      }
      for (const c of companies) {
        if (
          c.payment_plan_type === "one_time" &&
          c.one_time_payment_month === m &&
          c.one_time_payment_year === year &&
          paidCompanyMonths.has(`${c.id}:${m}`)
        ) {
          value += c.one_time_fee ?? 0;
        }
      }
      return { label: monthNames[m - 1], value: Math.round(value) };
    });
  }, [companies, paymentsQuery.data, year, monthNames]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t("superAdmin.dashboardPageTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("superAdmin.dashboardPageDesc")} — {monthLabel(month, year, lang)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("superAdmin.dashboardMonthLabel")}
            </Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {monthNames[m - 1]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("superAdmin.paymentsYearLabel")}
            </Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <p className="py-10 text-center text-sm text-destructive">
          {t("superAdmin.paymentsLoadFailed")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("superAdmin.dashboardTotalCompanies")}
              value={stats.total}
              icon={Building2}
              delay={0}
            />
            <StatCard
              label={t("superAdmin.dashboardPaidThisMonth")}
              value={stats.paidCount}
              icon={CheckCircle2}
              tone="up"
              delay={60}
            />
            <StatCard
              label={t("superAdmin.dashboardUnpaidThisMonth")}
              value={stats.unpaidCount}
              icon={AlertCircle}
              tone={stats.unpaidCount > 0 ? "down" : "default"}
              delay={120}
            />
            <StatCard
              label={t("superAdmin.dashboardTotalCollected")}
              value={stats.totalCollected}
              icon={DollarSign}
              tone="up"
              delay={180}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("superAdmin.dashboardExpectedRevenue")}
              value={stats.expectedRevenue}
              icon={Wallet}
              delay={240}
            />
            <StatCard
              label={t("superAdmin.dashboardCollectedRevenue")}
              value={stats.collectedRevenue}
              icon={DollarSign}
              tone="up"
              delay={300}
            />
            <StatCard
              label={t("superAdmin.dashboardTransferCount")}
              value={stats.transferCount}
              icon={ArrowLeftRight}
              delay={360}
            />
            <StatCard
              label={t("superAdmin.dashboardExemptCount")}
              value={stats.exemptCount}
              icon={Gift}
              delay={420}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label={t("superAdmin.dashboardFirstPaymentTotal")}
              value={stats.firstPaymentTotal}
              icon={Receipt}
              delay={480}
            />
            <StatCard
              label={t("superAdmin.dashboardOneTimeTotal")}
              value={stats.oneTimeTotal}
              icon={Receipt}
              delay={540}
            />
          </div>

          <Card
            className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
            style={{ animationDelay: "600ms" }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("superAdmin.dashboardTrendChartTitle")}
              </CardTitle>
              <CardDescription>{year}</CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyCollectedTrendChart data={monthlyTrend} t={t} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
              style={{ animationDelay: "660ms" }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t("superAdmin.dashboardStatusChartTitle")}
                </CardTitle>
                <CardDescription>{monthLabel(month, year, lang)}</CardDescription>
              </CardHeader>
              <CardContent>
                <PaymentStatusDonut
                  cashCount={stats.cashCount}
                  transferCount={stats.transferCount}
                  freeCount={stats.freeCount}
                  unpaidCount={stats.unpaidCount}
                  t={t}
                />
              </CardContent>
            </Card>

            <Card
              className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
              style={{ animationDelay: "720ms" }}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <div>
                  <CardTitle className="text-base">
                    {t("superAdmin.dashboardUnpaidListTitle")}
                  </CardTitle>
                  <CardDescription>
                    {stats.unpaid.length} {t("superAdmin.paymentsCompaniesCountSuffix")}
                  </CardDescription>
                </div>
                <Link to="/super-admin/payments">
                  <Button type="button" size="sm" variant="outline">
                    <Wallet className="ms-1.5 h-3.5 w-3.5" />
                    {t("superAdmin.dashboardGoToPaymentsButton")}
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {stats.unpaid.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("superAdmin.dashboardAllPaidMessage")}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border">
                    <div className="max-h-80 overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                          <TableRow className="hover:bg-transparent">
                            <TableHead>{t("superAdmin.paymentsCompanyColumn")}</TableHead>
                            <TableHead className="text-end">
                              {t("superAdmin.paymentsMonthlyFeeLabel")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stats.unpaid.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="flex items-center gap-2">
                                {c.logo_url ? (
                                  <img
                                    src={c.logo_url}
                                    alt=""
                                    className="h-7 w-7 shrink-0 rounded-md border border-border bg-background object-contain p-0.5"
                                  />
                                ) : (
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <Building2 className="h-3.5 w-3.5" />
                                  </div>
                                )}
                                <span className="truncate text-sm font-medium">{c.name}</span>
                              </TableCell>
                              <TableCell className="text-end text-sm text-muted-foreground">
                                {c.monthly_fee ?? "—"}
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
        </>
      )}
    </div>
  );
}
