import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Calendar, Loader2, Megaphone, Search, User } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { monthLabel } from "@/lib/excel";
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
  company_id: string;
  company_name: string;
  company_logo_url: string | null;
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

function RiderPage() {
  const { iqama } = Route.useParams();
  const { reportId } = Route.useSearch();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState(iqama);
  // Set when the rider disambiguates between multiple companies sharing
  // this iqama number. Reset whenever the iqama itself changes.
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRiderId(null);
  }, [iqama]);

  const lookupQuery = useQuery({
    queryKey: ["rider-lookup", iqama],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lookup_riders_by_iqama", { _iqama: iqama });
      if (error) throw error;
      return (data ?? []) as RiderMatch[];
    },
  });

  const matches = lookupQuery.data ?? [];
  const needsDisambiguation = matches.length > 1 && !selectedRiderId;
  const activeRiderId = selectedRiderId ?? (matches.length === 1 ? matches[0].rider_id : null);
  const activeRider = matches.find((m) => m.rider_id === activeRiderId) ?? null;

  const reportsQuery = useQuery({
    queryKey: ["rider-reports", activeRiderId],
    enabled: !!activeRiderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_rider_reports", {
        _rider_id: activeRiderId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Reports arrive pre-sorted (year desc, month desc, title asc), so
  // consecutive same-month rows can just be grouped in a single pass — a
  // company can upload several reports for one month (salaries, tiers,
  // kilometers...), and each becomes its own chip under that month.
  const reportGroups = useMemo(() => {
    const list = reportsQuery.data ?? [];
    const groups: { month: number; year: number; reports: typeof list }[] = [];
    for (const r of list) {
      const last = groups[groups.length - 1];
      if (last && last.month === r.month && last.year === r.year) {
        last.reports.push(r);
      } else {
        groups.push({ month: r.month, year: r.year, reports: [r] });
      }
    }
    return groups;
  }, [reportsQuery.data]);

  const reportData = useQuery({
    queryKey: ["rider-report", activeRiderId, reportId],
    enabled: !!reportId && !!activeRiderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_rider_report", {
        _rider_id: activeRiderId!,
        _report_id: reportId!,
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="border-b border-border/50 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowRight className="ms-1 inline h-4 w-4" />
            {t("rider.back")}
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
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {lookupQuery.isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!lookupQuery.isLoading && matches.length === 0 && (
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

        {activeRider && !needsDisambiguation && (
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
                      <div className="text-xs text-muted-foreground">
                        {t("rider.companyLabel")}
                      </div>
                      <div className="truncate text-lg font-bold">
                        {activeRider.company_name}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t("rider.riderLabel")}</div>
                      <div className="font-semibold">{activeRider.rider_name || "—"}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">{t("rider.iqamaLabel")}</div>
                  <div className="font-mono text-sm">{iqama}</div>
                  {matches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSelectedRiderId(null)}
                      className="mt-2 text-xs text-primary transition-colors hover:underline"
                    >
                      {t("rider.changeCompany")}
                    </button>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t("rider.monthsAvailable")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reportsQuery.isLoading && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {reportsQuery.data && reportsQuery.data.length === 0 && (
                    <div className="text-sm text-muted-foreground">{t("rider.noReports")}</div>
                  )}
                  {reportGroups.map((g, gi) => (
                    <div
                      key={`${g.year}-${g.month}`}
                      className="animate-in fade-in slide-in-from-bottom-1 space-y-1.5 duration-300 fill-mode-[backwards]"
                      style={{ animationDelay: `${gi * 60}ms` }}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {monthLabel(g.month, g.year, lang)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.reports.map((r) => {
                          const active = reportId === r.report_id;
                          return (
                            <Link
                              key={r.report_id}
                              to="/rider/$iqama"
                              params={{ iqama }}
                              search={{ reportId: r.report_id }}
                              className={`rounded-full border px-3 py-1 text-xs transition-all ${
                                active
                                  ? "border-primary bg-primary/10 font-medium text-foreground"
                                  : "border-border hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent"
                              }`}
                            >
                              {r.title}
                              {active && (
                                <Badge variant="secondary" className="ms-1.5 align-middle">
                                  {t("rider.openBadge")}
                                </Badge>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
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
  title: string;
  file_name: string;
  note: string | null;
}

function isNumericLike(v: unknown): v is number {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return true;
  return false;
}

const HIGHLIGHT_KEYS = {
  total: ["total", "orders", "الطلبات", "إجمالي", "اجمالي", "deliveries", "التوصيلات"],
  hours: ["hour", "ساعات", "ساعة"],
  salary: ["net", "salary", "راتب", "صافي", "المستحق"],
};

function pickMetric(data: Record<string, unknown>, keys: string[]) {
  const lower = Object.keys(data).map((k) => [k, k.toLowerCase()] as const);
  for (const key of keys) {
    const hit = lower.find(([, l]) => l.includes(key.toLowerCase()));
    if (hit && isNumericLike(data[hit[0]])) {
      return { label: hit[0], value: data[hit[0]] };
    }
  }
  return null;
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
          <h2 className="text-2xl font-bold">{data.title}</h2>
          <p className="text-sm text-muted-foreground">
            {monthLabel(data.month, data.year, lang)}
          </p>
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
