import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, Check, Gift, Loader2, Receipt, Settings, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  getPaymentReceiptUrl,
  listCompaniesForPayments,
  listCompanyPayments,
  markCompanyPaid,
  unmarkCompanyPaid,
  updateCompanyPaymentPlan,
} from "@/lib/payments.functions";
import { MONTH_NAMES_AR, MONTH_NAMES_EN } from "@/lib/month-label";
import { errText } from "@/lib/error-text";
import { hasAllowedDocExtension } from "@/lib/document-status";
import { formatDate } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/super-admin/payments")({
  component: PaymentsPage,
});

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type PlanType = "monthly" | "exempt" | "one_time";
type PaymentType = "cash" | "free";

interface CompanyRow {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
  payment_plan_type: string;
  monthly_fee: number | null;
  one_time_fee: number | null;
}

interface PaymentInfo {
  payment_type: PaymentType;
  storage_path: string | null;
  file_name: string | null;
}

// Per-company billing arrangement — independent of any single month's own
// mark. Switching to "exempt"/"one_time" here is what hides the monthly
// grid for this company below (see PaymentsPage), since neither is a
// recurring thing to check off month by month.
function CompanySettingsPopover({
  company,
  t,
}: {
  company: CompanyRow;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateCompanyPaymentPlan);
  const [open, setOpen] = useState(false);
  const [planType, setPlanType] = useState<PlanType>(
    (company.payment_plan_type as PlanType) ?? "monthly",
  );
  const [monthlyFee, setMonthlyFee] = useState(company.monthly_fee?.toString() ?? "");
  const [oneTimeFee, setOneTimeFee] = useState(company.one_time_fee?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const resetFromCompany = () => {
    setPlanType((company.payment_plan_type as PlanType) ?? "monthly");
    setMonthlyFee(company.monthly_fee?.toString() ?? "");
    setOneTimeFee(company.one_time_fee?.toString() ?? "");
  };

  const submit = async () => {
    setSaving(true);
    try {
      await updateFn({
        data: {
          companyId: company.id,
          planType,
          monthlyFee: monthlyFee.trim() ? Number(monthlyFee) : null,
          oneTimeFee: oneTimeFee.trim() ? Number(oneTimeFee) : null,
        },
      });
      toast.success(t("superAdmin.paymentsToastPlanSaved"));
      queryClient.invalidateQueries({ queryKey: ["companies-payments"] });
      setOpen(false);
    } catch (err) {
      toast.error(errText(err, t("superAdmin.paymentsToastMarkFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) resetFromCompany();
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-3">
          <p className="truncate text-sm font-medium">{company.name}</p>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("superAdmin.paymentsPlanTypeLabel")}
            </Label>
            <Select value={planType} onValueChange={(v) => setPlanType(v as PlanType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t("superAdmin.paymentsPlanMonthly")}</SelectItem>
                <SelectItem value="exempt">{t("superAdmin.paymentsPlanExempt")}</SelectItem>
                <SelectItem value="one_time">{t("superAdmin.paymentsPlanOneTime")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {planType === "monthly" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("superAdmin.paymentsMonthlyFeeLabel")}
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value)}
                dir="ltr"
              />
            </div>
          )}
          {planType === "one_time" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("superAdmin.paymentsOneTimeFeeLabel")}
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={oneTimeFee}
                onChange={(e) => setOneTimeFee(e.target.value)}
                dir="ltr"
              />
            </div>
          )}
          <Button type="button" size="sm" className="w-full" disabled={saving} onClick={submit}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// One cell in the company × month grid: a plain toggle button that opens a
// small popover to actually mark/unmark paid (as cash or a free month) and
// optionally attach a receipt, rather than acting on a single click — a
// whole month's payment (and whatever file sits under it) is too
// consequential to flip by accident on a dense grid like this.
function PaymentCell({
  companyId,
  companyName,
  year,
  month,
  payment,
  monthName,
  t,
}: {
  companyId: string;
  companyName: string;
  year: number;
  month: number;
  payment: PaymentInfo | undefined;
  monthName: string;
  t: (key: TranslationKey) => string;
}) {
  const queryClient = useQueryClient();
  const markFn = useServerFn(markCompanyPaid);
  const unmarkFn = useServerFn(unmarkCompanyPaid);
  const getUrlFn = useServerFn(getPaymentReceiptUrl);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["company-payments", year] });

  const uploadReceipt = async () => {
    if (!file) return null;
    if (!hasAllowedDocExtension(file.name)) {
      throw new Error(t("documents.toastInvalidExtension"));
    }
    const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
    const safeExt = extMatch ? extMatch[0].toLowerCase() : "";
    const path = `${companyId}/${year}-${String(month).padStart(2, "0")}/${crypto.randomUUID()}${safeExt}`;
    const { error } = await supabase.storage
      .from("payment-receipts")
      .upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return { storagePath: path, fileName: file.name };
  };

  const handleMark = async (paymentType: PaymentType) => {
    setSaving(true);
    try {
      const uploaded = await uploadReceipt();
      await markFn({
        data: {
          companyId,
          year,
          month,
          paymentType,
          storagePath: uploaded?.storagePath ?? null,
          fileName: uploaded?.fileName ?? null,
        },
      });
      toast.success(t("superAdmin.paymentsToastMarkedSuccess"));
      setFile(null);
      setOpen(false);
      invalidate();
    } catch (err) {
      toast.error(errText(err, t("superAdmin.paymentsToastMarkFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleAttachReceipt = async () => {
    if (!payment) return;
    setSaving(true);
    try {
      const uploaded = await uploadReceipt();
      if (!uploaded) return;
      await markFn({
        data: {
          companyId,
          year,
          month,
          paymentType: payment.payment_type,
          storagePath: uploaded.storagePath,
          fileName: uploaded.fileName,
        },
      });
      toast.success(t("superAdmin.paymentsToastReceiptSaved"));
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      invalidate();
    } catch (err) {
      toast.error(errText(err, t("superAdmin.paymentsToastMarkFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleUnmark = async () => {
    setSaving(true);
    try {
      await unmarkFn({ data: { companyId, year, month } });
      toast.success(t("superAdmin.paymentsToastUnmarkedSuccess"));
      setOpen(false);
      invalidate();
    } catch (err) {
      toast.error(errText(err, t("superAdmin.paymentsToastMarkFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleViewReceipt = async () => {
    try {
      const { url } = await getUrlFn({ data: { companyId, year, month } });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(errText(err, t("documents.toastDownloadFailed")));
    }
  };

  const isPaid = !!payment;
  const isFree = payment?.payment_type === "free";

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setFile(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${companyName} — ${monthName}`}
          className={
            "mx-auto flex h-8 w-8 items-center justify-center rounded-md border transition-colors " +
            (isPaid
              ? isFree
                ? "border-sky-300 bg-sky-50 text-sky-600 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-400"
                : "border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
              : "border-dashed border-muted-foreground/30 text-transparent hover:border-muted-foreground/60 hover:bg-muted")
          }
        >
          {isFree ? <Gift className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-3">
          <div>
            <p className="truncate text-sm font-medium">{companyName}</p>
            <p className="text-xs text-muted-foreground">
              {monthName}
              {isPaid && (
                <>
                  {" — "}
                  {isFree ? t("superAdmin.paymentsFreeBadge") : t("superAdmin.paymentsCashBadge")}
                </>
              )}
            </p>
          </div>
          {isPaid ? (
            <>
              {payment?.file_name ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={handleViewReceipt}
                >
                  <Receipt className="ms-1.5 h-3.5 w-3.5" />
                  {t("superAdmin.paymentsViewReceiptButton")}
                </Button>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("superAdmin.paymentsReceiptOptionalLabel")}
                  </Label>
                  <Input
                    ref={fileRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file && (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={saving}
                      onClick={handleAttachReceipt}
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("superAdmin.paymentsAttachReceiptButton")
                      )}
                    </Button>
                  )}
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                disabled={saving}
                onClick={handleUnmark}
              >
                {saving ? (
                  <Loader2 className="ms-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="ms-1.5 h-3.5 w-3.5" />
                )}
                {t("superAdmin.paymentsUnmarkButton")}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("superAdmin.paymentsReceiptOptionalLabel")}
                </Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => handleMark("cash")}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Check className="ms-1.5 h-3.5 w-3.5" />
                      {t("superAdmin.paymentsMarkCashButton")}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => handleMark("free")}
                >
                  <Gift className="ms-1.5 h-3.5 w-3.5" />
                  {t("superAdmin.paymentsMarkFreeButton")}
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PaymentsPage() {
  const { t, lang } = useLanguage();
  const listPaymentsFn = useServerFn(listCompanyPayments);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 3; y--) list.push(y);
    return list;
  }, [currentYear]);

  const listCompaniesFn = useServerFn(listCompaniesForPayments);
  const companiesQuery = useQuery({
    queryKey: ["companies-payments"],
    queryFn: () => listCompaniesFn(),
  });
  const paymentsQuery = useQuery({
    queryKey: ["company-payments", year],
    queryFn: () => listPaymentsFn({ data: { year } }),
  });

  const paymentByKey = useMemo(() => {
    const map = new Map<string, PaymentInfo>();
    for (const p of paymentsQuery.data ?? []) {
      map.set(`${p.company_id}:${p.month}`, {
        payment_type: (p.payment_type as PaymentType) ?? "cash",
        storage_path: p.storage_path,
        file_name: p.file_name,
      });
    }
    return map;
  }, [paymentsQuery.data]);

  const monthNames = lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_AR;
  const companies = (companiesQuery.data ?? []) as CompanyRow[];
  const isLoading = companiesQuery.isLoading || paymentsQuery.isLoading;
  const loadError = companiesQuery.error ?? paymentsQuery.error;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
      <div>
        <h2 className="text-2xl font-bold">{t("superAdmin.paymentsPageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("superAdmin.paymentsPageDesc")}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t("superAdmin.paymentsGridTitle")}</CardTitle>
              <CardDescription>
                {companies.length} {t("superAdmin.paymentsCompaniesCountSuffix")}
              </CardDescription>
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
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <p className="py-10 text-center text-sm text-destructive">
              {errText(loadError, t("superAdmin.paymentsLoadFailed"))}
            </p>
          ) : companies.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("superAdmin.paymentsNoCompanies")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[36rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-muted [&_th]:h-9 [&_th]:text-xs">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky start-0 z-20 min-w-[240px] bg-muted">
                        {t("superAdmin.paymentsCompanyColumn")}
                      </TableHead>
                      {MONTHS.map((m) => (
                        <TableHead key={m} className="whitespace-nowrap text-center">
                          {monthNames[m - 1]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="sticky start-0 z-10 max-w-[260px] bg-background shadow-[-4px_0_6px_-4px_rgb(0_0_0/0.15)]">
                          <div className="flex items-center gap-2">
                            {c.logo_url ? (
                              <img
                                src={c.logo_url}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-md border border-border bg-background object-contain p-0.5"
                              />
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Building2 className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{c.name}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {formatDate(c.created_at)}
                                {c.payment_plan_type === "monthly" && c.monthly_fee != null && (
                                  <>
                                    {" · "}
                                    {t("superAdmin.paymentsMonthlyFeeShort")} {c.monthly_fee}
                                  </>
                                )}
                              </div>
                            </div>
                            <CompanySettingsPopover company={c} t={t} />
                          </div>
                        </TableCell>
                        {c.payment_plan_type === "monthly" ? (
                          MONTHS.map((m) => (
                            <TableCell key={m} className="text-center">
                              <PaymentCell
                                companyId={c.id}
                                companyName={c.name}
                                year={year}
                                month={m}
                                payment={paymentByKey.get(`${c.id}:${m}`)}
                                monthName={monthNames[m - 1]}
                                t={t}
                              />
                            </TableCell>
                          ))
                        ) : (
                          <TableCell colSpan={12} className="text-center">
                            <Badge variant="secondary">
                              {c.payment_plan_type === "exempt"
                                ? t("superAdmin.paymentsExemptBadge")
                                : `${t("superAdmin.paymentsOneTimeBadge")}${
                                    c.one_time_fee != null ? ` — ${c.one_time_fee}` : ""
                                  }`}
                            </Badge>
                          </TableCell>
                        )}
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
