import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabase-paginate";

export type RiderReportRow = {
  rider_id: string;
  report_id: string;
  data: unknown;
  columns: unknown;
};

// Shared by the daily and monthly overview pages. Cached per report_id, not
// per date-range/selection — a range used to be one queryKey (the whole
// array of report ids), so widening/narrowing it by even a single day/month,
// or just switching back and forth between two overlapping periods, was a
// brand-new cache key and re-downloaded every row of every report in it from
// scratch. A full month already means ~30 report_ids × ~400+ riders each on
// the daily page; this only grows. Keying one query per report_id instead
// means a range/selection change only ever fetches the report_ids that
// weren't already cached — current and previous share the exact same
// per-id cache too, so flipping back to an already-seen period is instant.
//
// A report's rows are effectively immutable once uploaded — a "replace"
// re-upload deletes the old report_id entirely and creates a new one; the
// rarer "merge" re-upload is the only path that changes rows in place under
// the same report_id. Nothing currently invalidates this cache key when that
// happens, so a moderate staleTime lets it self-heal within a few minutes
// instead of caching forever, without undoing the point of caching per
// report_id at all.
const ROWS_STALE_MS = 5 * 60 * 1000;

export function useRiderReportsRows(currentReportIds: string[], previousReportIds: string[]) {
  const allNeededReportIds = useMemo(
    () => [...new Set([...currentReportIds, ...previousReportIds])],
    [currentReportIds, previousReportIds],
  );
  const rowsQueries = useQueries({
    queries: allNeededReportIds.map((reportId) => ({
      queryKey: ["rider-reports-rows", reportId],
      staleTime: ROWS_STALE_MS,
      queryFn: () =>
        fetchAllRows<RiderReportRow>(({ from, to }) =>
          supabase
            .from("rider_reports")
            .select("rider_id, report_id, data, columns")
            .eq("report_id", reportId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
    })),
  });
  const rowsQueryByReportId = useMemo(() => {
    const map = new Map<string, (typeof rowsQueries)[number]>();
    allNeededReportIds.forEach((id, i) => map.set(id, rowsQueries[i]));
    return map;
  }, [allNeededReportIds, rowsQueries]);

  const currentRowsQuery = useMemo(() => {
    const qs = currentReportIds.map((id) => rowsQueryByReportId.get(id));
    return {
      data: qs.flatMap((q) => q?.data ?? []),
      isLoading: qs.some((q) => q?.isLoading),
    };
  }, [currentReportIds, rowsQueryByReportId]);

  const previousRowsQuery = useMemo(() => {
    const qs = previousReportIds.map((id) => rowsQueryByReportId.get(id));
    return {
      data: qs.flatMap((q) => q?.data ?? []),
      isLoading: qs.some((q) => q?.isLoading),
    };
  }, [previousReportIds, rowsQueryByReportId]);

  return { currentRowsQuery, previousRowsQuery };
}
