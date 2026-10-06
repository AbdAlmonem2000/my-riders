import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { reportDateLabel } from "@/lib/month-label";
import { HIGHLIGHT_KEYS, isNumericLike, metricNumber, pickMetric } from "@/lib/rider-metrics";
import { DateInputDMY } from "@/components/date-input-dmy";
import { usePrintNode } from "@/lib/print-node";
import { checkIsAdmin } from "@/lib/reports.functions";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
});

// Remembered across visits (and page navigations, since it's read once at
// mount) the same way the admin sidebar's open/closed state is — so picking
// which columns to compare performance by isn't something the admin has to
// redo every time they land back on this page.
const METRIC_COLUMNS_STORAGE_KEY = "admin-dashboard-metric-columns";

function readStoredMetricColumns(): Set<string> {
  try {
    const stored = localStorage.getItem(METRIC_COLUMNS_STORAGE_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

// Each breakdown chart's own column pick persists under its own key (not
// shared with the other chart, and not the metricColumns above) — same
// idea as readStoredMetricColumns: survives navigating away, reloading, or
// logging out, since it only ever changes when the admin picks a different
// column themselves.
const BREAKDOWN_DONUT_COLUMN_KEY = "admin-dashboard-breakdown-donut-column";
const BREAKDOWN_BAR_COLUMN_KEY = "admin-dashboard-breakdown-bar-column";

function readStoredColumn(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredColumn(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can legitimately be unavailable (private browsing, quota) —
    // the pick still works for this session, just doesn't persist.
  }
}

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

// A small, dense KPI tile — unlike StatCard above (one per page-level
// total, with room for an icon), several of these sit in a single row for
// the filtered period's own numbers.
function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-lg font-bold tabular-nums ${
          tone === "up" ? "text-emerald-600" : tone === "down" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// Multi-select, same popover+checkbox pattern as AreaFilterPicker on the
// other admin pages — an empty selection means "automatic" (the heuristic
// total column), picking one or more pins the comparison to those columns
// instead: the first one drives the whole comparison, any further ones just
// get their own summary tile.
function MetricColumnPicker({
  columns,
  selected,
  onChange,
  t,
}: {
  columns: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (col: string) => {
    const next = new Set(selected);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    onChange(next);
  };

  const label =
    selected.size === 0
      ? t("admin.dashboardMetricColumnAuto")
      : selected.size === 1
        ? [...selected][0]
        : t("admin.dashboardMetricColumnCount").replace("{count}", String(selected.size));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between sm:w-64"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
          <Checkbox checked={selected.size === 0} onCheckedChange={() => onChange(new Set())} />
          {t("admin.dashboardMetricColumnAuto")}
        </label>
        <div className="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
          {columns.map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={selected.has(c)} onCheckedChange={() => toggle(c)} />
              <span className="truncate">{c}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PerfRow {
  riderId: string;
  riderName: string | null;
  idText: string | null;
  idNumber: string | null;
  current: number;
  previous: number | null;
  delta: number | null;
}

// Matches a rider's name, their displayed ID (Iqama when they have one,
// else their plain ID number) AND their plain ID number specifically — a
// rider with both still has to be findable by either one, not just
// whichever one happens to show.
function riderMatchesQuery(
  meta:
    | {
        name?: string | null;
        riderName?: string | null;
        idText?: string | null;
        idNumber?: string | null;
      }
    | undefined,
  q: string,
): boolean {
  // No meta at all means this rider isn't in the caller's own
  // riderMetaById — e.g. outside a restricted staff account's allowed
  // areas — so it's excluded unconditionally, search or no search, rather
  // than showing up as a nameless "—" row.
  if (!meta) return false;
  if (!q) return true;
  return (
    (meta.name ?? meta.riderName ?? "").toLowerCase().includes(q) ||
    (meta.idText ?? "").toLowerCase().includes(q) ||
    (meta.idNumber ?? "").toLowerCase().includes(q)
  );
}

// Biggest improvement first, biggest decline last, with riders new to the
// period (no previous value to compare against) sorted after everyone with
// a real delta — shared by the live table and the printed export so the two
// always read in the same order.
function sortPerfRows(rows: PerfRow[]): PerfRow[] {
  return [...rows].sort((a, b) => {
    if (a.delta === null && b.delta === null) return b.current - a.current;
    if (a.delta === null) return 1;
    if (b.delta === null) return -1;
    return b.delta - a.delta;
  });
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
  declined: "var(--destructive)",
  same: "var(--muted-foreground)",
  new: "var(--chart-1)",
};

// The app's qualitative chart palette (5 distinct, non-black colors) — used
// to give each top performer's bar its own color instead of a single flat
// (near-black) --primary fill.
const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
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

// Same four categories as StatusSummaryChart, as a donut instead — reads
// the share of each group at a glance, with the total rider count centered
// in the hole. Purely a second view of the same counts, so it reuses the
// exact same colors/labels as the bar chart right next to it.
function StatusDonutChart({
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
  ].filter((d) => d.value > 0);
  const total = improvedCount + declinedCount + sameCount + newCount;
  const config: ChartConfig = { value: { label: t("admin.dashboardRidersCountLabel") } };

  // Always keeps its slot in the layout (same height, same position) instead
  // of unmounting when a search narrows the rider list to zero matches — an
  // unmounted/remounted chart was what made this box visibly blink out and
  // back in while typing.
  return (
    <div className="relative flex h-40 items-center justify-center">
      {total === 0 ? (
        <span className="text-xs text-muted-foreground">{t("documents.searchNoResults")}</span>
      ) : (
        <>
          <ChartContainer config={config} className="aspect-auto h-40 w-full">
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
                  <Cell key={d.key} fill={STATUS_CHART_COLORS[d.key]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums">{total}</span>
            <span className="text-[10px] text-muted-foreground">
              {t("admin.dashboardRidersCountLabel")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// The chosen metric's total across every rider, one point per day in the
// selected range — a full-width strip under the breakdown panels, reading
// left-to-right as oldest -> newest like the other trend chart on this page.
function DailyTrendChart({
  data,
  metricLabel,
  t,
}: {
  data: { label: string; value: number }[];
  metricLabel: string | null;
  t: (key: TranslationKey) => string;
}) {
  const config: ChartConfig = { value: { label: metricLabel ?? "" } };

  // Keeps its own card mounted at all times (title + fixed-height frame),
  // even with 0 or 1 points — a search that narrows the range down no
  // longer makes this whole panel vanish and reappear as you type.
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-sm font-medium">{t("admin.dashboardDailyTrendTitle")}</div>
      {data.length < 2 ? (
        <div className="flex h-48 items-center justify-center">
          <span className="text-xs text-muted-foreground">{t("documents.searchNoResults")}</span>
        </div>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-48 w-full">
          <LineChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_PALETTE[0]}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_PALETTE[0] }}
            >
              <LabelList dataKey="value" position="top" fontSize={11} className="fill-foreground" />
            </Line>
          </LineChart>
        </ChartContainer>
      )}
    </div>
  );
}

type RiderMetaMap = Map<
  string,
  { name: string | null; idText: string | null; idNumber: string | null }
>;

interface BreakdownChartProps {
  rows: { rider_id: string; data: unknown }[];
  availableColumns: string[];
  riderMetaById: RiderMetaMap;
  highlightQuery: string;
  canPickColumn: boolean;
  defaultColumn: string | null;
  t: (key: TranslationKey) => string;
}

// A column picker baked into the chart's own header — each breakdown chart
// below has its own, so the donut and the bar chart can show two completely
// different columns side by side instead of being locked to one shared pick.
function BreakdownColumnPicker({
  title,
  availableColumns,
  activeColumn,
  canPickColumn,
  onChange,
  t,
}: {
  title: string;
  availableColumns: string[];
  activeColumn: string | null;
  canPickColumn: boolean;
  onChange: (column: string) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm font-medium">{title}</div>
      {canPickColumn && availableColumns.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">
            {t("admin.dashboardBreakdownColumnLabel")}
          </Label>
          <Select value={activeColumn ?? undefined} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((col) => (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// How a column's values are distributed across riders — top 5 values by
// how many riders have them, the rest folded into "Other". Always renders
// its own frame even with no data so it never un/remounts (and visibly
// blinks) as a search narrows the rider list down.
function BreakdownDonutChart({
  rows,
  availableColumns,
  riderMetaById,
  highlightQuery,
  canPickColumn,
  defaultColumn,
  t,
}: BreakdownChartProps) {
  const [pickedColumn, setPickedColumn] = useState<string | null>(() =>
    readStoredColumn(BREAKDOWN_DONUT_COLUMN_KEY),
  );
  const activeColumn = pickedColumn ?? defaultColumn ?? availableColumns[0] ?? null;
  const handleColumnChange = (column: string) => {
    setPickedColumn(column);
    writeStoredColumn(BREAKDOWN_DONUT_COLUMN_KEY, column);
  };

  const donutData = useMemo(() => {
    if (!activeColumn) return [];
    const q = highlightQuery.trim().toLowerCase();
    const valueCounts = new Map<string, number>();
    for (const r of rows) {
      if (!riderMatchesQuery(riderMetaById.get(r.rider_id), q)) continue;
      const raw = (r.data as Record<string, unknown> | null)?.[activeColumn];
      if (raw === undefined || raw === null || raw === "") continue;
      const text = String(raw).trim();
      valueCounts.set(text, (valueCounts.get(text) ?? 0) + 1);
    }
    const sortedValues = [...valueCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sortedValues.slice(0, 5);
    const restSum = sortedValues.slice(5).reduce((s, [, c]) => s + c, 0);
    return [
      ...top.map(([label, value], i) => ({ key: `v${i}`, label, value })),
      ...(restSum > 0
        ? [{ key: "other", label: t("admin.dashboardBreakdownOtherLabel"), value: restSum }]
        : []),
    ];
  }, [rows, activeColumn, highlightQuery, riderMetaById, t]);

  const donutConfig: ChartConfig = { value: { label: t("admin.dashboardBreakdownDonutTitle") } };
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);
  const donutColors = [...CHART_PALETTE, "var(--muted-foreground)"];

  return (
    <div className="rounded-lg border p-3">
      <BreakdownColumnPicker
        title={t("admin.dashboardBreakdownDonutTitle")}
        availableColumns={availableColumns}
        activeColumn={activeColumn}
        canPickColumn={canPickColumn}
        onChange={handleColumnChange}
        t={t}
      />
      <div className="relative flex h-48 items-center justify-center">
        {donutData.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("documents.searchNoResults")}</span>
        ) : (
          <>
            <ChartContainer config={donutConfig} className="aspect-auto h-48 w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="55%"
                  outerRadius="90%"
                  paddingAngle={2}
                  strokeWidth={2}
                >
                  {donutData.map((d, i) => (
                    <Cell key={d.key} fill={donutColors[i % donutColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums">{donutTotal}</span>
            </div>
          </>
        )}
      </div>
      {donutData.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {donutData.map((d, i) => (
            <div key={d.key} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: donutColors[i % donutColors.length] }}
              />
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-medium tabular-nums">
                {donutTotal > 0 ? Math.round((d.value / donutTotal) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Which riders have the biggest total for a column — a plain, single-series
// bar chart (never dual-axis) so two differently-scaled metrics are never
// forced onto one chart.
function BreakdownBarChart({
  rows,
  availableColumns,
  riderMetaById,
  highlightQuery,
  canPickColumn,
  defaultColumn,
  t,
}: BreakdownChartProps) {
  const [pickedColumn, setPickedColumn] = useState<string | null>(() =>
    readStoredColumn(BREAKDOWN_BAR_COLUMN_KEY),
  );
  const activeColumn = pickedColumn ?? defaultColumn ?? availableColumns[0] ?? null;
  const handleColumnChange = (column: string) => {
    setPickedColumn(column);
    writeStoredColumn(BREAKDOWN_BAR_COLUMN_KEY, column);
  };

  const { barData, isNumeric } = useMemo(() => {
    if (!activeColumn) return { barData: [], isNumeric: false };
    const q = highlightQuery.trim().toLowerCase();
    const riderSums = new Map<string, number>();
    let numericSeen = 0;
    let totalSeen = 0;
    for (const r of rows) {
      if (!riderMatchesQuery(riderMetaById.get(r.rider_id), q)) continue;
      const raw = (r.data as Record<string, unknown> | null)?.[activeColumn];
      if (raw === undefined || raw === null || raw === "") continue;
      totalSeen++;
      if (isNumericLike(raw)) {
        const n = metricNumber(raw);
        if (n !== null) {
          numericSeen++;
          riderSums.set(r.rider_id, (riderSums.get(r.rider_id) ?? 0) + n);
        }
      }
    }
    const barData = [...riderSums.entries()]
      .map(([riderId, value]) => {
        const meta = riderMetaById.get(riderId);
        return {
          riderId,
          label: meta?.name || meta?.idText || meta?.idNumber || riderId,
          value: Math.round(value),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    return { barData, isNumeric: totalSeen > 0 && numericSeen / totalSeen > 0.5 };
  }, [rows, activeColumn, highlightQuery, riderMetaById]);

  const barConfig: ChartConfig = { value: { label: t("admin.dashboardBreakdownBarTitle") } };

  return (
    <div className="rounded-lg border p-3">
      <BreakdownColumnPicker
        title={t("admin.dashboardBreakdownBarTitle")}
        availableColumns={availableColumns}
        activeColumn={activeColumn}
        canPickColumn={canPickColumn}
        onChange={handleColumnChange}
        t={t}
      />
      {barData.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <span className="text-xs text-muted-foreground">
            {isNumeric ? t("documents.searchNoResults") : t("admin.dashboardBreakdownNotNumeric")}
          </span>
        </div>
      ) : (
        <ChartContainer config={barConfig} className="aspect-auto h-48 w-full">
          <BarChart data={barData} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={10}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={40}
            />
            <YAxis hide allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" radius={4} fill={CHART_PALETTE[0]}>
              <LabelList dataKey="value" position="top" fontSize={10} className="fill-foreground" />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}

// Every rider in the current period, not just the top 5 — searchable by
// name, sorted by the biggest change first (new riders, with no previous
// value to compare against, sort after everyone with a real delta).
function RidersPerformanceTable({
  rows,
  metricLabel,
  showChange,
  query,
  onQueryChange,
  t,
}: {
  rows: PerfRow[];
  metricLabel: string | null;
  showChange: boolean;
  // Shared with the KPI tiles above, so typing here filters the whole page
  // together instead of disconnected boxes.
  query: string;
  onQueryChange: (value: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => riderMatchesQuery(r, q)) : rows;
    return sortPerfRows(list);
  }, [rows, query]);

  const colSpan = showChange ? 4 : 3;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("admin.dashboardRiderSearchPlaceholder")}
          className="ps-9"
        />
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("admin.riderNameLabel")}</TableHead>
              <TableHead>{t("admin.tableIqama")}</TableHead>
              <TableHead>{metricLabel ?? t("admin.dashboardMetricValue")}</TableHead>
              {showChange && <TableHead>{t("admin.dashboardChangeColumn")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.riderId}>
                <TableCell className="font-medium">{r.riderName || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {r.idText || "—"}
                </TableCell>
                <TableCell className="font-mono">{r.current}</TableCell>
                {showChange && (
                  <TableCell>
                    {r.delta === null ? (
                      <span className="text-xs text-muted-foreground">
                        {t("admin.dashboardNewCount")}
                      </span>
                    ) : (
                      <span
                        className={
                          r.delta > 0
                            ? "font-mono font-semibold text-emerald-600"
                            : r.delta < 0
                              ? "font-mono font-semibold text-destructive"
                              : "font-mono text-muted-foreground"
                        }
                      >
                        {r.delta > 0 ? "+" : ""}
                        {r.delta}
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  {t("documents.searchNoResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface RiderHistoryEntry {
  reportId: string;
  month: number;
  year: number;
  day: number | null;
  note: string | null;
  data: Record<string, unknown>;
  columns: string[];
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

interface CompanyLetterhead {
  name: string;
  logoUrl: string | null;
  unifiedNumber: string | null;
  commercialRegistration: string | null;
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
  iqamaNumber: string | null;
  idNumber: string | null;
  photoUrl: string | null;
  photoRotation: number;
}

function RiderSearchCard({
  t,
  lang,
  delay,
  company,
  canRotatePhotos,
  onFound,
  pickMetricValue,
}: {
  t: (key: TranslationKey) => string;
  lang: "ar" | "en";
  delay: number;
  company: CompanyLetterhead | null;
  canRotatePhotos: boolean;
  // Lets the main dashboard's "all riders" table filter itself to the same
  // rider as soon as one is found here, instead of being two disconnected
  // searches.
  onFound: (riderName: string | null) => void;
  // Same column the admin picked in "مقارنة الأداء حسب عمود" above, so this
  // card's own table reads the same metric as the rest of the page instead
  // of always falling back to an auto-detected "total" column.
  pickMetricValue: (row: Record<string, unknown>) => { label: string; value: unknown } | null;
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
        .select("id, month, year, day, note")
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
            day: rep.day,
            note: rep.note,
            data: (rr.data ?? {}) as Record<string, unknown>,
            columns: Array.isArray(rr.columns) ? (rr.columns as unknown[]).map(String) : [],
          };
        })
        .filter((x): x is RiderHistoryEntry => x !== null)
        .sort((a, b) => b.year - a.year || b.month - a.month || (b.day ?? 0) - (a.day ?? 0));
    },
  });

  // Sorted newest-first, so the entry right after this one is the previous
  // month chronologically — used to compute the trend/change column.
  const historyData = historyQuery.data;
  const historyWithTrend = useMemo(() => {
    const history = historyData ?? [];
    return history.map((entry, i) => {
      const m = pickMetricValue(entry.data);
      const current = m ? metricNumber(m.value) : null;
      const prevEntry = history[i + 1];
      const prevMetric = prevEntry ? pickMetricValue(prevEntry.data) : null;
      const previous = prevMetric ? metricNumber(prevMetric.value) : null;
      return {
        entry,
        metricLabel: m?.label ?? null,
        current,
        delta: current !== null && previous !== null ? current - previous : null,
      };
    });
  }, [historyData, pickMetricValue]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setSearching(true);
    setNotFound(false);
    try {
      const byIqama = await supabase
        .from("riders")
        .select("id, rider_name, iqama_number, id_number, photo_url, photo_rotation")
        .eq("iqama_number", q)
        .is("deleted_at", null)
        .maybeSingle();
      const rider =
        byIqama.data ??
        (
          await supabase
            .from("riders")
            .select("id, rider_name, iqama_number, id_number, photo_url, photo_rotation")
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
          iqamaNumber: rider.iqama_number,
          idNumber: rider.id_number,
          photoUrl: rider.photo_url,
          photoRotation: rider.photo_rotation,
        });
        onFound(rider.rider_name);
      }
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setFoundRider(null);
    setNotFound(false);
    onFound(null);
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
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              {foundRider.photoUrl ? (
                <RiderPhoto
                  riderId={foundRider.id}
                  src={foundRider.photoUrl}
                  alt={foundRider.riderName ?? ""}
                  rotation={foundRider.photoRotation}
                  canRotate={canRotatePhotos}
                  className="h-14 w-14 shrink-0 rounded-full border border-border"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-6 w-6" />
                </div>
              )}
              <div>
                <div className="text-base font-semibold">{foundRider.riderName || "—"}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {foundRider.iqamaNumber && (
                    <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {t("admin.tableIqama")}: {foundRider.iqamaNumber}
                    </div>
                  )}
                  {foundRider.idNumber && (
                    <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {t("admin.tableIdNumber")}: {foundRider.idNumber}
                    </div>
                  )}
                </div>
              </div>
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
                          {reportDateLabel(entry.day, entry.month, entry.year, lang)}
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
                            title={reportDateLabel(entry.day, entry.month, entry.year, lang)}
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
        .order("month", { ascending: false })
        .order("day", { ascending: false, nullsFirst: false });
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

  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);

  // The dashboard compares a chosen date range against the equal-length
  // period right before it — a plain calendar month is just the common
  // case (from day 1 to the month's last day), not a special code path.
  // Defaults to the latest month that actually has a report, so the
  // dashboard looks the same as before (a whole month) until the admin
  // narrows it down.
  const latestReport = reports[0] ?? null;
  const defaultRange = useMemo(() => {
    if (!latestReport) return null;
    const lastDay = new Date(Date.UTC(latestReport.year, latestReport.month, 0)).getUTCDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      from: `${latestReport.year}-${pad(latestReport.month)}-01`,
      to: `${latestReport.year}-${pad(latestReport.month)}-${pad(lastDay)}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestReport?.year, latestReport?.month]);

  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  // Only seeds the fields once, the first time a default becomes available
  // — never overwrites a range the admin already picked.
  useEffect(() => {
    if (!rangeFrom && !rangeTo && defaultRange) {
      setRangeFrom(defaultRange.from);
      setRangeTo(defaultRange.to);
    }
  }, [defaultRange, rangeFrom, rangeTo]);

  const DAY_MS = 86_400_000;
  const parseIsoDate = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  };
  const fromParsed = parseIsoDate(rangeFrom);
  const toParsed = parseIsoDate(rangeTo);
  const fromMs = fromParsed ? Date.UTC(fromParsed.y, fromParsed.m - 1, fromParsed.d) : null;
  const toMs = toParsed ? Date.UTC(toParsed.y, toParsed.m - 1, toParsed.d) : null;
  const rangeValid = fromMs !== null && toMs !== null && fromMs <= toMs;
  const rangeDays = rangeValid ? Math.round((toMs! - fromMs!) / DAY_MS) + 1 : 0;
  // A whole calendar month (day 1 to that month's last day) compares against
  // the previous CALENDAR month, not a generic "same number of days back" —
  // months have different lengths, so counting backward by day count alone
  // would drift off the actual previous month's boundaries (e.g. 31 days
  // back from the end of October lands in August, not September). Any
  // other, genuinely custom range (not aligned to a full month) still
  // compares against the equal-length window immediately before it.
  const isFullMonthRange =
    rangeValid &&
    fromParsed!.d === 1 &&
    toParsed!.y === fromParsed!.y &&
    toParsed!.m === fromParsed!.m &&
    toParsed!.d === new Date(Date.UTC(fromParsed!.y, fromParsed!.m, 0)).getUTCDate();
  let prevFromMs: number | null = null;
  let prevToMs: number | null = null;
  if (isFullMonthRange) {
    const prevMonthDate = new Date(Date.UTC(fromParsed!.y, fromParsed!.m - 2, 1));
    const py = prevMonthDate.getUTCFullYear();
    const pm = prevMonthDate.getUTCMonth() + 1;
    prevFromMs = Date.UTC(py, pm - 1, 1);
    prevToMs = Date.UTC(py, pm, 0);
  } else if (rangeValid) {
    prevToMs = fromMs! - DAY_MS;
    prevFromMs = prevToMs - (rangeDays - 1) * DAY_MS;
  }

  // A report row with no day (uploaded before daily reports existed) stands
  // for its ENTIRE month, so it's "in range" whenever the range touches that
  // month at all — everything else compares the exact calendar day.
  function reportInWindow(
    r: { year: number; month: number; day: number | null },
    winFromMs: number,
    winToMs: number,
  ): boolean {
    if (r.day != null) {
      const ms = Date.UTC(r.year, r.month - 1, r.day);
      return ms >= winFromMs && ms <= winToMs;
    }
    const monthStartMs = Date.UTC(r.year, r.month - 1, 1);
    const monthEndMs = Date.UTC(r.year, r.month, 0);
    return monthStartMs <= winToMs && monthEndMs >= winFromMs;
  }

  const currentReportIds = useMemo(() => {
    if (!rangeValid) return [];
    return reports.filter((r) => reportInWindow(r, fromMs!, toMs!)).map((r) => r.id);
  }, [reports, rangeValid, fromMs, toMs]);

  const previousReportIds = useMemo(() => {
    if (!rangeValid || prevFromMs === null || prevToMs === null) return [];
    return reports.filter((r) => reportInWindow(r, prevFromMs, prevToMs)).map((r) => r.id);
  }, [reports, rangeValid, prevFromMs, prevToMs]);

  const hasPrevious = previousReportIds.length > 0;

  const previousRangeLabel = useMemo(() => {
    if (!hasPrevious || prevFromMs === null || prevToMs === null) return null;
    const from = new Date(prevFromMs);
    const to = new Date(prevToMs);
    const fromLabel = reportDateLabel(
      from.getUTCDate(),
      from.getUTCMonth() + 1,
      from.getUTCFullYear(),
      lang,
    );
    if (prevFromMs === prevToMs) return fromLabel;
    const toLabel = reportDateLabel(
      to.getUTCDate(),
      to.getUTCMonth() + 1,
      to.getUTCFullYear(),
      lang,
    );
    return `${fromLabel} — ${toLabel}`;
  }, [hasPrevious, prevFromMs, prevToMs, lang]);

  const currentRowsQuery = useQuery({
    queryKey: ["rider-reports-rows", "range", currentReportIds],
    enabled: currentReportIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_reports")
        .select("rider_id, report_id, data, columns")
        .in("report_id", currentReportIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const previousRowsQuery = useQuery({
    queryKey: ["rider-reports-rows", "range", previousReportIds],
    enabled: previousReportIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_reports")
        .select("rider_id, data")
        .in("report_id", previousReportIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const riderMetaById = useMemo(() => {
    const map = new Map<
      string,
      { name: string | null; idText: string | null; idNumber: string | null }
    >();
    for (const r of ridersQuery.data ?? []) {
      map.set(r.id, {
        name: r.rider_name,
        // The displayed fallback (prefers Iqama) — kept separate from
        // idNumber below so a rider WITH an Iqama can still be found by
        // searching their plain ID number, not just whichever one shows.
        idText: r.iqama_number || r.id_number || null,
        idNumber: r.id_number,
      });
    }
    return map;
  }, [ridersQuery.data]);

  // Lets the admin pin the comparison to one or more specific columns
  // instead of the auto-detected "total" heuristic — populated from
  // whatever columns this period's rows actually carry. The FIRST selected
  // column (if any) drives the whole comparison (delta/improved/declined/
  // chart/table/trend), same as a single pick always did; any additional
  // ones picked alongside it just get their own summary tile below.
  const [metricColumns, setMetricColumnsState] = useState<Set<string>>(() =>
    readStoredMetricColumns(),
  );
  const setMetricColumns = (next: Set<string>) => {
    setMetricColumnsState(next);
    try {
      localStorage.setItem(METRIC_COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* private browsing — not persisted, still switches for this visit */
    }
  };
  const metricColumnsList = [...metricColumns];
  const primaryMetricColumn = metricColumnsList[0] ?? "auto";
  const extraMetricColumns = metricColumnsList.slice(1);
  // Shared between the "all riders" table's own search box and every KPI
  // tile/chart on the page, so one search box drives everything together.
  const [highlightQuery, setHighlightQuery] = useState("");
  const availableColumns = useMemo(() => {
    const set = new Set<string>();
    for (const rr of currentRowsQuery.data ?? []) {
      const cols = Array.isArray(rr.columns)
        ? (rr.columns as unknown[]).map(String)
        : Object.keys((rr.data ?? {}) as object);
      for (const c of cols) set.add(c);
    }
    return [...set];
  }, [currentRowsQuery.data]);

  const pickMetricValue = useCallback(
    (row: Record<string, unknown>) => {
      if (primaryMetricColumn === "auto") return pickMetric(row, HIGHLIGHT_KEYS.total);
      return isNumericLike(row[primaryMetricColumn])
        ? { label: primaryMetricColumn, value: row[primaryMetricColumn] }
        : null;
    },
    [primaryMetricColumn],
  );

  // One extra total per additional column picked alongside the primary one
  // — just a sum across the current period, not a full delta comparison.
  // A picked column isn't always a number — a "status"/"city"/rating-style
  // column is just as likely. Summing those would be meaningless (and used
  // to silently show "0"), so a column that isn't purely numeric shows its
  // actual distinct text values instead of a total.
  const extraMetricTotals = useMemo(() => {
    const q = highlightQuery.trim().toLowerCase();
    return extraMetricColumns.map((col) => {
      const seen: string[] = [];
      let allNumeric = true;
      let sum = 0;
      for (const rr of currentRowsQuery.data ?? []) {
        if (!riderMatchesQuery(riderMetaById.get(rr.rider_id), q)) continue;
        const row = (rr.data ?? {}) as Record<string, unknown>;
        const raw = row[col];
        if (raw === undefined || raw === null || raw === "") continue;
        if (isNumericLike(raw)) {
          const n = metricNumber(raw);
          if (n !== null) sum += n;
        } else {
          allNumeric = false;
        }
        seen.push(String(raw).trim());
      }
      // Summing many rows in floating point can land on something like
      // 4822.080000000002 — round it off before it ever reaches the tile.
      if (allNumeric) return { column: col, display: String(Math.round(sum)) };
      const distinct = [...new Set(seen)];
      const display =
        distinct.length > 3 ? `${distinct.slice(0, 3).join("، ")}…` : distinct.join("، ");
      return { column: col, display: display || "—" };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRowsQuery.data, extraMetricColumns.join("|"), highlightQuery, riderMetaById]);

  // A rider can have more than one row within the chosen range now (one per
  // day uploaded), so each period's per-rider value is the SUM of every row
  // it contributed — consistent with how the upload side already treats a
  // rider appearing twice in one sheet (mergeReportRows sums numeric
  // columns), just extended across the whole range instead of one sheet.
  const { metricLabel, rows } = useMemo(() => {
    const sumByRider = (list: { rider_id: string; data: unknown }[]) => {
      const sums = new Map<string, number>();
      let label: string | null = null;
      for (const rr of list) {
        const m = pickMetricValue((rr.data ?? {}) as Record<string, unknown>);
        if (!m) continue;
        const n = metricNumber(m.value);
        if (n === null) continue;
        label ??= m.label;
        sums.set(rr.rider_id, (sums.get(rr.rider_id) ?? 0) + n);
      }
      return { sums, label };
    };
    const prev = sumByRider(previousRowsQuery.data ?? []);
    const curr = sumByRider(currentRowsQuery.data ?? []);
    const out: PerfRow[] = [];
    for (const [riderId, n] of curr.sums) {
      // A restricted staff account's rider list (riderMetaById, RLS-scoped
      // to their allowed areas) can be narrower than the report rows it can
      // read — without this, a rider outside their areas still showed up as
      // a nameless "—" row instead of being left out entirely.
      const meta = riderMetaById.get(riderId);
      if (!meta) continue;
      const previous = prev.sums.has(riderId) ? prev.sums.get(riderId)! : null;
      out.push({
        riderId,
        riderName: meta.name,
        idText: meta.idText,
        idNumber: meta.idNumber,
        current: n,
        previous,
        delta: previous === null ? null : n - previous,
      });
    }
    return { metricLabel: curr.label ?? prev.label, rows: out };
  }, [currentRowsQuery.data, previousRowsQuery.data, riderMetaById, pickMetricValue]);

  // Everything the KPI tiles show narrows to match the "all riders" table's
  // own search box, driven by the same highlightQuery.
  const visibleRows = useMemo(() => {
    const q = highlightQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.riderName ?? "").toLowerCase().includes(q) ||
        (r.idText ?? "").toLowerCase().includes(q) ||
        (r.idNumber ?? "").toLowerCase().includes(q),
    );
  }, [rows, highlightQuery]);

  const improved = visibleRows
    .filter((r) => r.delta !== null && r.delta > 0)
    .sort((a, b) => b.delta! - a.delta!)
    .slice(0, 5);
  const declined = visibleRows
    .filter((r) => r.delta !== null && r.delta < 0)
    .sort((a, b) => a.delta! - b.delta!)
    .slice(0, 5);
  const sameCount = visibleRows.filter((r) => r.delta === 0).length;
  const newCount = visibleRows.filter((r) => r.delta === null).length;
  // Rounded for the same reason as extraMetricTotals above — summing many
  // riders' values in floating point drifts off a clean whole number.
  const totalCurrent = Math.round(visibleRows.reduce((s, r) => s + r.current, 0));

  // One point per day in the selected range — the sum of every rider's
  // value that day, not per-rider, so it reads as "how busy was this day"
  // rather than duplicating the per-rider breakdown above.
  const dailyTrend = useMemo(() => {
    const reportById = new Map(reports.map((r) => [r.id, r]));
    const q = highlightQuery.trim().toLowerCase();
    const sums = new Map<string, number>();
    for (const rr of currentRowsQuery.data ?? []) {
      if (!riderMatchesQuery(riderMetaById.get(rr.rider_id), q)) continue;
      const m = pickMetricValue((rr.data ?? {}) as Record<string, unknown>);
      if (!m) continue;
      const n = metricNumber(m.value);
      if (n === null) continue;
      sums.set(rr.report_id, (sums.get(rr.report_id) ?? 0) + n);
    }
    return [...sums.entries()]
      .map(([reportId, value]) => {
        const rep = reportById.get(reportId);
        if (!rep) return null;
        const ms = rep.day
          ? Date.UTC(rep.year, rep.month - 1, rep.day)
          : Date.UTC(rep.year, rep.month - 1, 1);
        // Summing many rows' values in floating point can land on something
        // like 2362.4500000000003 — rounding here (not just at display time)
        // means the tooltip shows the same clean number as the point label.
        return {
          ms,
          label: reportDateLabel(rep.day, rep.month, rep.year, lang),
          value: Math.round(value),
        };
      })
      .filter((x): x is { ms: number; label: string; value: number } => x !== null)
      .sort((a, b) => a.ms - b.ms);
  }, [currentRowsQuery.data, reports, pickMetricValue, lang, highlightQuery, riderMetaById]);

  const isLoadingDashboard =
    currentReportIds.length > 0 &&
    (currentRowsQuery.isLoading || (hasPrevious && previousRowsQuery.isLoading));

  // Which column drives every metric on this page is a configuration choice,
  // not a view — gated the same way reports.tsx gates uploading/editing: a
  // 'view'-tier staff member can read the dashboard but not change what it
  // shows, while a real admin (adminCheck.data is null for one) always can.
  const canPickMetricColumn = adminCheck.data ? adminCheck.data.reportsAccess === "full" : true;

  // One row per rider per uploaded day, exactly as uploaded (every original
  // column, not just the picked metric) — currentRowsQuery.data is already
  // scoped to the "من/إلى" range above, and riderMetaById is already scoped
  // to whichever riders THIS account can see (a restricted staff account
  // only ever sees their own), so both constraints fall out for free.
  const handleExportExcel = async () => {
    const reportById = new Map(reports.map((r) => [r.id, r]));
    const columnOrder: string[] = [];
    const seenCols = new Set<string>();
    const exportRows: Record<string, unknown>[] = [];
    for (const rr of currentRowsQuery.data ?? []) {
      const meta = riderMetaById.get(rr.rider_id);
      if (!meta) continue;
      const rep = reportById.get(rr.report_id);
      const data = (rr.data ?? {}) as Record<string, unknown>;
      const cols =
        Array.isArray(rr.columns) && rr.columns.length > 0
          ? (rr.columns as unknown[]).map(String)
          : Object.keys(data);
      for (const c of cols) {
        if (!seenCols.has(c)) {
          seenCols.add(c);
          columnOrder.push(c);
        }
      }
      const row: Record<string, unknown> = {
        [t("admin.riderNameLabel")]: meta.name ?? "",
        [t("admin.tableIqama")]: meta.idText ?? "",
        [t("admin.tableIdNumber")]: meta.idNumber ?? "",
        [t("admin.tableMonth")]: rep ? reportDateLabel(rep.day, rep.month, rep.year, lang) : "",
      };
      for (const c of cols) row[c] = data[c];
      exportRows.push(row);
    }
    if (exportRows.length === 0) {
      toast.error(t("admin.dashboardExportEmpty"));
      return;
    }
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Riders");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `riders-report-${rangeFrom || "all"}-${rangeTo || "all"}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

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
          delay={60}
        />
        <StatCard
          label={t("admin.statLastReport")}
          value={
            reportsQuery.data?.[0]
              ? reportDateLabel(
                  reportsQuery.data[0].day,
                  reportsQuery.data[0].month,
                  reportsQuery.data[0].year,
                  lang,
                )
              : "—"
          }
          icon={CheckCircle2}
          delay={120}
        />
      </div>

      <RiderSearchCard
        t={t}
        lang={lang}
        delay={180}
        company={companyLetterhead}
        canRotatePhotos={adminCheck.data?.ridersAccess === "full"}
        onFound={(riderName) => setHighlightQuery(riderName ?? "")}
        pickMetricValue={pickMetricValue}
      />

      <Card
        className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]"
        style={{ animationDelay: "260ms" }}
      >
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("admin.dashboardTitle")}</CardTitle>
              <CardDescription>{t("admin.dashboardDesc")}</CardDescription>
            </div>
            {reports.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("admin.dashboardRangeFrom")}
                  </Label>
                  <DateInputDMY value={rangeFrom} onChange={setRangeFrom} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("admin.dashboardRangeTo")}
                  </Label>
                  <DateInputDMY value={rangeTo} onChange={setRangeTo} />
                </div>
                {rows.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleExportExcel}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <FileSpreadsheet className="ms-1.5 h-3.5 w-3.5" />
                    {t("admin.dashboardExportExcelButton")}
                  </Button>
                )}
              </div>
            )}
          </div>
          {availableColumns.length > 0 && canPickMetricColumn && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("admin.dashboardMetricColumnLabel")}
              </Label>
              <div className="flex items-center gap-2">
                <MetricColumnPicker
                  columns={availableColumns}
                  selected={metricColumns}
                  onChange={setMetricColumns}
                  t={t}
                />
                {metricColumns.size > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setMetricColumns(new Set())}
                  >
                    <X className="ms-1.5 h-3.5 w-3.5" />
                    {t("admin.dashboardMetricColumnClear")}
                  </Button>
                )}
              </div>
            </div>
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
                {hasPrevious ? (
                  <>
                    {" — "}
                    {t("admin.dashboardComparedTo")}{" "}
                    <span className="font-medium">{previousRangeLabel}</span>
                  </>
                ) : (
                  <> — {t("admin.dashboardNoPrevious")}</>
                )}
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <MiniStat label={t("admin.dashboardRidersCountLabel")} value={visibleRows.length} />
                <MiniStat
                  label={metricLabel ?? t("admin.dashboardMetricValue")}
                  value={totalCurrent}
                />
                {hasPrevious && (
                  <>
                    <MiniStat
                      label={t("admin.dashboardImproved")}
                      value={improved.length}
                      tone="up"
                    />
                    <MiniStat
                      label={t("admin.dashboardDeclined")}
                      value={declined.length}
                      tone="down"
                    />
                    <MiniStat label={t("admin.dashboardSameCount")} value={sameCount} />
                    <MiniStat label={t("admin.dashboardNewCount")} value={newCount} />
                  </>
                )}
                {extraMetricTotals.map((m) => (
                  <MiniStat key={m.column} label={m.column} value={m.display} />
                ))}
              </div>

              {hasPrevious && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <div className="mb-2 text-sm font-medium">
                        {t("admin.dashboardStatusChartTitle")}
                      </div>
                      <StatusSummaryChart
                        improvedCount={improved.length}
                        declinedCount={declined.length}
                        sameCount={sameCount}
                        newCount={newCount}
                        t={t}
                      />
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="mb-2 text-sm font-medium">
                        {t("admin.dashboardStatusDonutTitle")}
                      </div>
                      <StatusDonutChart
                        improvedCount={improved.length}
                        declinedCount={declined.length}
                        sameCount={sameCount}
                        newCount={newCount}
                        t={t}
                      />
                    </div>
                  </div>
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
                </>
              )}

              <DailyTrendChart data={dailyTrend} metricLabel={metricLabel} t={t} />

              <div className="grid gap-3 sm:grid-cols-2">
                <BreakdownDonutChart
                  rows={currentRowsQuery.data ?? []}
                  availableColumns={availableColumns}
                  riderMetaById={riderMetaById}
                  highlightQuery={highlightQuery}
                  canPickColumn={canPickMetricColumn}
                  defaultColumn={
                    primaryMetricColumn !== "auto"
                      ? primaryMetricColumn
                      : (availableColumns[0] ?? null)
                  }
                  t={t}
                />
                <BreakdownBarChart
                  rows={currentRowsQuery.data ?? []}
                  availableColumns={availableColumns}
                  riderMetaById={riderMetaById}
                  highlightQuery={highlightQuery}
                  canPickColumn={canPickMetricColumn}
                  defaultColumn={
                    primaryMetricColumn !== "auto"
                      ? primaryMetricColumn
                      : (availableColumns[0] ?? null)
                  }
                  t={t}
                />
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  {t("admin.dashboardAllRidersTitle")}
                </div>
                <RidersPerformanceTable
                  rows={rows}
                  metricLabel={metricLabel}
                  showChange={hasPrevious}
                  query={highlightQuery}
                  onQueryChange={setHighlightQuery}
                  t={t}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
