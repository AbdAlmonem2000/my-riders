import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  Award,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RiderPhoto } from "@/components/rider-photo";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { monthLabel } from "@/lib/month-label";
import { HIGHLIGHT_KEYS, metricNumber, pickMetric } from "@/lib/rider-metrics";
import { usePrintNode } from "@/lib/print-node";
import { checkIsAdmin } from "@/lib/reports.functions";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
});

function StatCard({
  label,
  value,
  icon: Icon,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
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
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 hover:scale-110">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

interface PerfRow {
  riderId: string;
  riderName: string | null;
  current: number;
  previous: number | null;
  delta: number | null;
}

function PerformanceList({
  title,
  icon: Icon,
  tone,
  rows,
  emptyLabel,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "up" | "down";
  rows: PerfRow[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className={tone === "up" ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-destructive"} />
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.riderId} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{r.riderName || "—"}</span>
              <span
                className={
                  tone === "up"
                    ? "shrink-0 font-mono font-semibold text-emerald-600"
                    : "shrink-0 font-mono font-semibold text-destructive"
                }
              >
                {r.delta! > 0 ? "+" : ""}
                {r.delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Status colors match what PerformanceList already uses for the same
// categories (emerald for improved, destructive for declined), so the chart
// reads as one system with the lists right below it rather than introducing
// a new palette. "new" uses a chart palette color instead of --primary,
// since --primary renders as near-black in this theme.
const STATUS_CHART_COLORS: Record<string, string> = {
  improved: "#059669",
  declined: "hsl(var(--destructive))",
  same: "hsl(var(--muted-foreground))",
  new: "hsl(var(--chart-1))",
};

// The app's qualitative chart palette (5 distinct, non-black colors) — used
// to give each top performer's bar its own color instead of a single flat
// (near-black) --primary fill.
const CHART_PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function StatusSummaryChart({
  improvedCount,
  declinedCount,
  sameCount,
  newCount,
  t,
}: {
  improvedCount: number;
  declinedCount: number;
  sameCount: number;
  newCount: number;
  t: (key: TranslationKey) => string;
}) {
  const data = [
    { key: "improved", label: t("admin.dashboardImproved"), value: improvedCount },
    { key: "declined", label: t("admin.dashboardDeclined"), value: declinedCount },
    { key: "same", label: t("admin.dashboardSameCount"), value: sameCount },
    { key: "new", label: t("admin.dashboardNewCount"), value: newCount },
  ];
  const config: ChartConfig = { value: { label: t("admin.dashboardRidersCountLabel") } };

  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={4}>
          {data.map((d) => (
            <Cell key={d.key} fill={STATUS_CHART_COLORS[d.key]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function TopPerformersChart({
  rows,
  metricLabel,
}: {
  rows: PerfRow[];
  metricLabel: string | null;
}) {
  const data = rows.map((r) => ({ name: r.riderName || "—", value: r.current }));
  const config: ChartConfig = { value: { label: metricLabel ?? "" } };

  return (
    <ChartContainer config={config} className="aspect-auto h-44 w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={90}
          fontSize={11}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={4}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

interface RiderHistoryEntry {
  reportId: string;
  month: number;
  year: number;
  note: string | null;
  data: Record<string, unknown>;
  columns: string[];
}

function RiderTrendChart({
  rows,
  metricLabel,
  lang,
  t,
}: {
  rows: { entry: RiderHistoryEntry; current: number | null }[];
  metricLabel: string | null;
  lang: "ar" | "en";
  t: (key: TranslationKey) => string;
}) {
  // rows arrive newest-first (see historyWithTrend) — a trend chart reads
  // left-to-right as oldest -> newest, so reverse it.
  const data = [...rows]
    .filter((r): r is { entry: RiderHistoryEntry; current: number } => r.current !== null)
    .reverse()
    .map((r) => ({
      label: monthLabel(r.entry.month, r.entry.year, lang),
      value: r.current,
    }));
  if (data.length < 2) return null;
  const config: ChartConfig = { value: { label: metricLabel ?? "" } };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-sm font-medium">{t("admin.dashboardRiderTrendTitle")}</div>
      <ChartContainer config={config} className="aspect-auto h-40 w-full">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis hide />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--chart-2))" }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

interface CompanyLetterhead {
  name: string;
  logoUrl: string | null;
  unifiedNumber: string | null;
  commercialRegistration: string | null;
}

function RiderMonthDetailsContent({
  title,
  riderName,
  entry,
}: {
  title: string;
  riderName: string | null;
  entry: RiderHistoryEntry;
}) {
  const cols = entry.columns.length > 0 ? entry.columns : Object.keys(entry.data);
  return (
    <div className="space-y-4 bg-background p-1">
      <div>
        {riderName && <div className="text-sm text-muted-foreground">{riderName}</div>}
        <div className="text-lg font-bold">{title}</div>
      </div>
      {entry.note && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm whitespace-pre-wrap">
          {entry.note}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {cols.map((col) => {
          const val = entry.data[col];
          if (val === undefined || val === null || val === "") return null;
          return (
            <div key={col} className="rounded-lg border border-border/60 p-3">
              <div className="text-xs text-muted-foreground">{col}</div>
              <div className="mt-1 truncate font-medium tabular-nums" title={String(val)}>
                {String(val)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Plain-inline-styled variant used for the printed/downloaded output only
// (never shown live in the dialog). It carries the company letterhead, like
// the official letters do. It deliberately avoids Tailwind's theme classes
// (bg-background, text-muted-foreground, ...) which resolve through CSS
// variables defined with oklch() — html2canvas cannot parse that color
// function and throws, which was the cause of the image-download error.
// Fixed, plain colors sidestep that entirely and also make the export look
// like a proper printed document regardless of the app's current theme.
function RiderMonthDetailsExport({
  title,
  riderName,
  entry,
  company,
  t,
}: {
  title: string;
  riderName: string | null;
  entry: RiderHistoryEntry;
  company: CompanyLetterhead | null;
  t: (key: TranslationKey) => string;
}) {
  const cols = entry.columns.length > 0 ? entry.columns : Object.keys(entry.data);
  return (
    <div
      style={{
        background: "#ffffff",
        color: "#111827",
        padding: 32,
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {company && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: "1px solid #e5e7eb",
            paddingBottom: 16,
            marginBottom: 16,
          }}
        >
          {company.logoUrl && (
            <img
              src={company.logoUrl}
              alt={company.name}
              style={{ height: 40, width: 40, objectFit: "contain", flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{company.name}</div>
            {(company.commercialRegistration || company.unifiedNumber) && (
              <div
                style={{
                  marginTop: 2,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  fontSize: 10,
                  color: "#6b7280",
                }}
              >
                {company.commercialRegistration && (
                  <span>
                    {t("letters.crLabel")}{" "}
                    <span dir="ltr" style={{ fontFamily: "monospace" }}>
                      {company.commercialRegistration}
                    </span>
                  </span>
                )}
                {company.unifiedNumber && (
                  <span>
                    {t("letters.unifiedNumberLabel")}{" "}
                    <span dir="ltr" style={{ fontFamily: "monospace" }}>
                      {company.unifiedNumber}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div>
        {riderName && <div style={{ fontSize: 13, color: "#6b7280" }}>{riderName}</div>}
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
      </div>
      {entry.note && (
        <div
          style={{
            marginTop: 16,
            borderRadius: 8,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            padding: 12,
            fontSize: 14,
            whiteSpace: "pre-wrap",
          }}
        >
          {entry.note}
        </div>
      )}
      <div
        style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
      >
        {cols.map((col) => {
          const val = entry.data[col];
          if (val === undefined || val === null || val === "") return null;
          return (
            <div key={col} style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: 12 }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{col}</div>
              <div style={{ marginTop: 4, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {String(val)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RiderMonthDetailsDialog({
  title,
  riderName,
  entry,
  company,
  t,
}: {
  title: string;
  riderName: string | null;
  entry: RiderHistoryEntry;
  company: CompanyLetterhead | null;
  t: (key: TranslationKey) => string;
}) {
  const exportNode = (
    <RiderMonthDetailsExport
      title={title}
      riderName={riderName}
      entry={entry}
      company={company}
      t={t}
    />
  );
  const { portal, print } = usePrintNode(exportNode);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t("admin.dashboardDetailsButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 border-b pb-3 print:hidden">
          <Button type="button" size="sm" variant="outline" onClick={print}>
            <Printer className="ms-1.5 h-3.5 w-3.5" />
            {t("admin.dashboardDownloadPdf")}
          </Button>
        </div>
        <RiderMonthDetailsContent title={title} riderName={riderName} entry={entry} />
        {portal}
      </DialogContent>
    </Dialog>
  );
}

interface FoundRider {
  id: string;
  riderName: string | null;
  photoUrl: string | null;
  photoRotation: number;
}

function RiderSearchCard({
  t,
  lang,
  delay,
  company,
  canRotatePhotos,
}: {
  t: (key: TranslationKey) => string;
  lang: "ar" | "en";
  delay: number;
  company: CompanyLetterhead | null;
  canRotatePhotos: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [foundRider, setFoundRider] = useState<FoundRider | null>(null);

  const historyQuery = useQuery({
    queryKey: ["rider-history", foundRider?.id],
    enabled: !!foundRider,
    queryFn: async (): Promise<RiderHistoryEntry[]> => {
      const { data: rrRows, error } = await supabase
        .from("rider_reports")
        .select("report_id, data, columns")
        .eq("rider_id", foundRider!.id);
      if (error) throw error;
      const reportIds = (rrRows ?? []).map((r) => r.report_id);
      if (reportIds.length === 0) return [];

      const { data: reportRows, error: repErr } = await supabase
        .from("reports")
        .select("id, month, year, note")
        .in("id", reportIds);
      if (repErr) throw repErr;
      const repById = new Map((reportRows ?? []).map((r) => [r.id, r]));

      return (rrRows ?? [])
        .map((rr): RiderHistoryEntry | null => {
          const rep = repById.get(rr.report_id);
          if (!rep) return null;
          return {
            reportId: rr.report_id,
            month: rep.month,
            year: rep.year,
            note: rep.note,
            data: (rr.data ?? {}) as Record<string, unknown>,
            columns: Array.isArray(rr.columns) ? (rr.columns as unknown[]).map(String) : [],
          };
        })
        .filter((x): x is RiderHistoryEntry => x !== null)
        .sort((a, b) => b.year - a.year || b.month - a.month);
    },
  });

  // Sorted newest-first, so the entry right after this one is the previous
  // month chronologically — used to compute the trend arrow.
  const historyData = historyQuery.data;
  const historyWithTrend = useMemo(() => {
    const history = historyData ?? [];
    return history.map((entry, i) => {
      const m = pickMetric(entry.data, HIGHLIGHT_KEYS.total);
      const current = m ? metricNumber(m.value) : null;
      const prevEntry = history[i + 1];
      const prevMetric = prevEntry ? pickMetric(prevEntry.data, HIGHLIGHT_KEYS.total) : null;
      const previous = prevMetric ? metricNumber(prevMetric.value) : null;
      return {
        entry,
        metricLabel: m?.label ?? null,
        current,
        delta: current !== null && previous !== null ? current - previous : null,
      };
    });
  }, [historyData]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setSearching(true);
    setNotFound(false);
    try {
      const byIqama = await supabase
        .from("riders")
        .select("id, rider_name, photo_url, photo_rotation")
        .eq("iqama_number", q)
        .is("deleted_at", null)
        .maybeSingle();
      const rider =
        byIqama.data ??
        (
          await supabase
            .from("riders")
            .select("id, rider_name, photo_url, photo_rotation")
            .eq("id_number", q)
            .is("deleted_at", null)
            .maybeSingle()
        ).data;
      if (!rider) {
        setFoundRider(null);
        setNotFound(true);
      } else {
        setFoundRider({
          id: rider.id,
          riderName: rider.rider_name,
          photoUrl: rider.photo_url,
          photoRotation: rider.photo_rotation,
        });
      }
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setFoundRider(null);
    setNotFound(false);
  };

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          {t("admin.dashboardSearchTitle")}
        </CardTitle>
        <CardDescription>{t("admin.dashboardSearchDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("admin.dashboardSearchPlaceholder")}
            dir="ltr"
            className="flex-1"
          />
          <Button type="submit" disabled={searching || !searchInput.trim()}>
            <Search className="ms-2 h-4 w-4" />
            {t("admin.dashboardSearchButton")}
          </Button>
          {foundRider && (
            <Button type="button" variant="ghost" onClick={clearSearch}>
              <X className="ms-2 h-4 w-4" />
              {t("admin.dashboardSearchClear")}
            </Button>
          )}
        </form>

        {notFound && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("admin.dashboardSearchNotFound")}
          </p>
        )}

        {foundRider && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {foundRider.photoUrl ? (
                <RiderPhoto
                  riderId={foundRider.id}
                  src={foundRider.photoUrl}
                  alt={foundRider.riderName ?? ""}
                  rotation={foundRider.photoRotation}
                  canRotate={canRotatePhotos}
                  className="h-10 w-10 shrink-0 rounded-full border border-border"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </div>
              )}
              <div className="font-semibold">{foundRider.riderName || "—"}</div>
            </div>

            {historyQuery.isLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              </div>
            ) : historyWithTrend.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("admin.dashboardSearchNoReports")}
              </p>
            ) : (
              <div className="space-y-3">
                <RiderTrendChart
                  rows={historyWithTrend}
                  metricLabel={historyWithTrend.find((r) => r.metricLabel)?.metricLabel ?? null}
                  lang={lang}
                  t={t}
                />
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.tableMonth")}</TableHead>
                        <TableHead>{t("admin.dashboardMetricValue")}</TableHead>
                        <TableHead>{t("admin.dashboardChangeColumn")}</TableHead>
                        <TableHead className="text-end">{t("admin.tableActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyWithTrend.map(({ entry, metricLabel, current, delta }) => (
                        <TableRow key={entry.reportId}>
                          <TableCell className="font-medium">
                            {monthLabel(entry.month, entry.year, lang)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {current !== null ? current : "—"}
                            {metricLabel && (
                              <span className="ms-1.5 text-xs text-muted-foreground">
                                ({metricLabel})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {delta === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span
                                className={
                                  delta > 0
                                    ? "font-mono font-semibold text-emerald-600"
                                    : delta < 0
                                      ? "font-mono font-semibold text-destructive"
                                      : "font-mono text-muted-foreground"
                                }
                              >
                                {delta > 0 ? "+" : ""}
                                {delta}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            <RiderMonthDetailsDialog
                              title={monthLabel(entry.month, entry.year, lang)}
                              riderName={foundRider?.riderName ?? null}
                              entry={entry}
                              company={company}
                              t={t}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminOverview() {
  const { t, lang } = useLanguage();

  const isAdminFn = useServerFn(checkIsAdmin);
  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });

  // Same query key/shape as the letters page, for cache sharing — used here
  // only to put the company letterhead (name/logo/registration numbers) on
  // exported month details, like the official letters do.
  const companyQuery = useQuery({
    queryKey: ["company-profile", adminCheck.data?.companyId],
    enabled: !!adminCheck.data?.companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("name, logo_url, unified_number, commercial_registration")
        .eq("id", adminCheck.data!.companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const companyLetterhead: CompanyLetterhead | null = companyQuery.data
    ? {
        name: companyQuery.data.name,
        logoUrl: companyQuery.data.logo_url,
        unifiedNumber: companyQuery.data.unified_number,
        commercialRegistration: companyQuery.data.commercial_registration,
      }
    : null;

  // Same query key/shape as the reports page — sharing the cache means
  // switching tabs doesn't re-fetch, and the table is small enough that a
  // full select here is cheap.
  const reportsQuery = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const riderCountQuery = useQuery({
    queryKey: ["company-riders-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("riders")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Same key/shape as the riders page, for the same cache-sharing reason —
  // only rider_name is actually used here.
  const ridersQuery = useQuery({
    queryKey: ["company-riders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("riders")
        .select(
          "id, iqama_number, id_number, rider_name, photo_url, photo_rotation, extra, is_blocked, password_hash",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const reports = reportsQuery.data ?? [];
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const activeReport = reports.find((r) => r.id === selectedReportId) ?? reports[0] ?? null;
  const activeIndex = activeReport ? reports.findIndex((r) => r.id === activeReport.id) : -1;
  const previousReport =
    activeIndex >= 0 && activeIndex + 1 < reports.length ? reports[activeIndex + 1] : null;

  const currentRowsQuery = useQuery({
    queryKey: ["rider-reports-rows", activeReport?.id],
    enabled: !!activeReport,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_reports")
        .select("rider_id, data")
        .eq("report_id", activeReport!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const previousRowsQuery = useQuery({
    queryKey: ["rider-reports-rows", previousReport?.id],
    enabled: !!previousReport,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_reports")
        .select("rider_id, data")
        .eq("report_id", previousReport!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of ridersQuery.data ?? []) map.set(r.id, r.rider_name);
    return map;
  }, [ridersQuery.data]);

  const { metricLabel, rows } = useMemo(() => {
    const prevMap = new Map<string, number>();
    for (const rr of previousRowsQuery.data ?? []) {
      const m = pickMetric((rr.data ?? {}) as Record<string, unknown>, HIGHLIGHT_KEYS.total);
      const n = m ? metricNumber(m.value) : null;
      if (n !== null) prevMap.set(rr.rider_id, n);
    }
    let label: string | null = null;
    const out: PerfRow[] = [];
    for (const rr of currentRowsQuery.data ?? []) {
      const m = pickMetric((rr.data ?? {}) as Record<string, unknown>, HIGHLIGHT_KEYS.total);
      if (!m) continue;
      const n = metricNumber(m.value);
      if (n === null) continue;
      label ??= m.label;
      const previous = prevMap.has(rr.rider_id) ? prevMap.get(rr.rider_id)! : null;
      out.push({
        riderId: rr.rider_id,
        riderName: nameById.get(rr.rider_id) ?? null,
        current: n,
        previous,
        delta: previous === null ? null : n - previous,
      });
    }
    return { metricLabel: label, rows: out };
  }, [currentRowsQuery.data, previousRowsQuery.data, nameById]);

  const improved = rows
    .filter((r) => r.delta !== null && r.delta > 0)
    .sort((a, b) => b.delta! - a.delta!)
    .slice(0, 5);
  const declined = rows
    .filter((r) => r.delta !== null && r.delta < 0)
    .sort((a, b) => a.delta! - b.delta!)
    .slice(0, 5);
  const sameCount = rows.filter((r) => r.delta === 0).length;
  const newCount = rows.filter((r) => r.delta === null).length;
  const topPerformers = [...rows].sort((a, b) => b.current - a.current).slice(0, 5);

  const isLoadingDashboard =
    !!activeReport &&
    (currentRowsQuery.isLoading || (!!previousReport && previousRowsQuery.isLoading));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("admin.statReportsCount")}
          value={reportsQuery.data?.length ?? 0}
          icon={FileSpreadsheet}
          delay={0}
        />
        <StatCard
          label={t("admin.statRegisteredRiders")}
          value={riderCountQuery.data ?? 0}
          icon={Users}
          delay={80}
        />
        <StatCard
          label={t("admin.statLastReport")}
          value={
            reportsQuery.data?.[0]
              ? monthLabel(reportsQuery.data[0].month, reportsQuery.data[0].year, lang)
              : "—"
          }
          icon={CheckCircle2}
          delay={160}
        />
      </div>

      <Card
        className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
        style={{ animationDelay: "220ms" }}
      >
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("admin.dashboardTitle")}</CardTitle>
            <CardDescription>{t("admin.dashboardDesc")}</CardDescription>
          </div>
          {reports.length > 0 && (
            <Select
              value={activeReport?.id ?? undefined}
              onValueChange={(v) => setSelectedReportId(v)}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {monthLabel(r.month, r.year, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("admin.dashboardNoReports")}
            </p>
          ) : isLoadingDashboard ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("admin.dashboardNoMetric")}
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t("admin.dashboardMetricCaption")}{" "}
                <span className="font-medium">{metricLabel}</span>
                {previousReport ? (
                  <>
                    {" — "}
                    {t("admin.dashboardComparedTo")}{" "}
                    <span className="font-medium">
                      {monthLabel(previousReport.month, previousReport.year, lang)}
                    </span>
                  </>
                ) : (
                  <> — {t("admin.dashboardNoPrevious")}</>
                )}
              </p>

              {previousReport ? (
                <>
                  <StatusSummaryChart
                    improvedCount={improved.length}
                    declinedCount={declined.length}
                    sameCount={sameCount}
                    newCount={newCount}
                    t={t}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PerformanceList
                      title={t("admin.dashboardImproved")}
                      icon={TrendingUp}
                      tone="up"
                      rows={improved}
                      emptyLabel={t("admin.dashboardNoImproved")}
                    />
                    <PerformanceList
                      title={t("admin.dashboardDeclined")}
                      icon={TrendingDown}
                      tone="down"
                      rows={declined}
                      emptyLabel={t("admin.dashboardNoDeclined")}
                    />
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>
                      {t("admin.dashboardSameCount")}:{" "}
                      <span className="font-medium">{sameCount}</span>
                    </span>
                    <span>
                      {t("admin.dashboardNewCount")}:{" "}
                      <span className="font-medium">{newCount}</span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Award className="h-4 w-4 text-primary" />
                    {t("admin.dashboardTopPerformers")}
                  </div>
                  <TopPerformersChart rows={topPerformers} metricLabel={metricLabel} />
                  <div className="mt-3 space-y-1.5">
                    {topPerformers.map((r) => (
                      <div
                        key={r.riderId}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">{r.riderName || "—"}</span>
                        <span className="shrink-0 font-mono font-semibold">{r.current}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <RiderSearchCard
        t={t}
        lang={lang}
        delay={280}
        company={companyLetterhead}
        canRotatePhotos={adminCheck.data?.ridersAccess === "full"}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/riders"
          className="animate-in fade-in slide-in-from-bottom-2 block rounded-xl duration-500 fill-mode-[backwards]"
          style={{ animationDelay: "300ms" }}
        >
          <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t("admin.navRiders")}
              </CardTitle>
              <CardDescription>{t("admin.rosterCardDesc")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link
          to="/admin/reports"
          className="animate-in fade-in slide-in-from-bottom-2 block rounded-xl duration-500 fill-mode-[backwards]"
          style={{ animationDelay: "360ms" }}
        >
          <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("admin.navReports")}
              </CardTitle>
              <CardDescription>{t("admin.uploadCardDesc")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
