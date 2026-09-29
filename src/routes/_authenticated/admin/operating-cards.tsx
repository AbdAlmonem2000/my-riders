import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Download, Eye, Loader2, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/doc-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRiderDocumentDownloadUrl } from "@/lib/documents.functions";
import { OPERATING_CARD_TYPES, computeDocStatus, type DocType } from "@/lib/document-status";
import { errText } from "@/lib/error-text";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/operating-cards")({
  component: AdminOperatingCards,
});

interface RiderLite {
  id: string;
  rider_name: string | null;
  iqama_number: string | null;
  id_number: string | null;
  area: string | null;
}

interface CardDocRow {
  id: string;
  rider_id: string;
  doc_type: string;
  card_number: string | null;
  expiry_date: string | null;
}

// Both operating-card slots enforce their own 3-rider cap independently (see
// assertOperatingCardAssignment in documents.functions.ts), so the same card
// number could legitimately carry a different set of riders in each slot —
// grouped by (doc_type, card_number) together rather than by number alone.
interface CardGroup {
  key: string;
  docType: string;
  cardNumber: string;
  riders: {
    riderId: string;
    riderName: string;
    idText: string;
    area: string | null;
    expiryDate: string | null;
  }[];
}

function docTypeKey(dt: string): TranslationKey {
  return `documents.type.${dt}` as TranslationKey;
}

function AdminOperatingCards() {
  const { t } = useLanguage();
  const downloadUrlFn = useServerFn(getRiderDocumentDownloadUrl);
  const [search, setSearch] = useState("");

  const handleView = async (riderId: string, docType: string) => {
    try {
      const { url } = await downloadUrlFn({ data: { riderId, docType, preview: true } });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("documents.toastDownloadFailed")));
    }
  };

  const handleDownload = async (riderId: string, docType: string) => {
    try {
      const { url } = await downloadUrlFn({ data: { riderId, docType } });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("documents.toastDownloadFailed")));
    }
  };

  const ridersQuery = useQuery({
    queryKey: ["operating-cards-riders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("riders")
        .select("id, rider_name, iqama_number, id_number, area")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      return data as RiderLite[];
    },
  });

  const cardDocsQuery = useQuery({
    queryKey: ["operating-cards-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_documents")
        .select("id, rider_id, doc_type, card_number, expiry_date")
        .in("doc_type", [...OPERATING_CARD_TYPES])
        .limit(5000);
      if (error) throw error;
      return data as CardDocRow[];
    },
  });

  const isLoading = ridersQuery.isLoading || cardDocsQuery.isLoading;

  const groups = useMemo(() => {
    const riderById = new Map((ridersQuery.data ?? []).map((r) => [r.id, r]));
    const byKey = new Map<string, CardGroup>();
    for (const d of cardDocsQuery.data ?? []) {
      const cardNumber = d.card_number?.trim();
      if (!cardNumber) continue;
      const key = `${d.doc_type}:${cardNumber}`;
      const rider = riderById.get(d.rider_id);
      const group = byKey.get(key) ?? {
        key,
        docType: d.doc_type,
        cardNumber,
        riders: [],
      };
      group.riders.push({
        riderId: d.rider_id,
        riderName: rider?.rider_name || "—",
        idText: rider?.iqama_number || rider?.id_number || "—",
        area: rider?.area ?? null,
        expiryDate: d.expiry_date,
      });
      byKey.set(key, group);
    }
    return [...byKey.values()].sort((a, b) => a.cardNumber.localeCompare(b.cardNumber));
  }, [cardDocsQuery.data, ridersQuery.data]);

  const filteredGroups = useMemo(() => {
    const q = search.trim();
    if (!q) return groups;
    return groups.filter((g) => g.cardNumber.includes(q));
  }, [groups, search]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
      <div>
        <h2 className="text-2xl font-bold">{t("operatingCards.pageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("operatingCards.pageDesc")}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            {t("operatingCards.listTitle")}
          </CardTitle>
          <CardDescription>
            {t("operatingCards.listDesc")} ({filteredGroups.length})
          </CardDescription>
          <div className="relative pt-2">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("operatingCards.searchPlaceholder")}
              dir="ltr"
              className="ps-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && filteredGroups.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("operatingCards.empty")}
            </p>
          )}
          {!isLoading && filteredGroups.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[36rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableCardNumber")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableType")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("operatingCards.tableCount")}
                      </TableHead>
                      <TableHead className="min-w-[280px]">
                        {t("operatingCards.tableRiders")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.map((g) => (
                      <TableRow key={g.key}>
                        <TableCell className="whitespace-nowrap font-mono text-sm" dir="ltr">
                          {g.cardNumber}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {t(docTypeKey(g.docType as DocType))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Users className="h-3 w-3" />
                            {g.riders.length}/3
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            {g.riders.map((r) => {
                              const { status, daysLeft } = computeDocStatus(r.expiryDate);
                              return (
                                <div
                                  key={r.riderId}
                                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                                >
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium">{r.riderName}</span>{" "}
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {r.idText}
                                    </span>
                                    {r.area && (
                                      <span className="ms-1.5 text-xs text-muted-foreground">
                                        · {r.area}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <StatusBadge status={status} daysLeft={daysLeft} t={t} />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      title={t("documents.viewButton")}
                                      onClick={() => handleView(r.riderId, g.docType)}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      title={t("documents.downloadButton")}
                                      onClick={() => handleDownload(r.riderId, g.docType)}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
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
  );
}
