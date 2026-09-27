import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  Loader2,
  Megaphone,
  Send,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RiderPhoto } from "@/components/rider-photo";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  sendRiderNotification,
  listSentRiderNotifications,
  deleteRiderNotification,
} from "@/lib/rider-notifications.functions";
import { checkIsAdmin } from "@/lib/reports.functions";
import { errText } from "@/lib/error-text";
import { formatDate } from "@/lib/date-format";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { usePushDispatch } from "@/lib/push-client";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: AdminNotifications,
});

interface RiderRow {
  id: string;
  rider_name: string | null;
  iqama_number: string | null;
  id_number: string | null;
  photo_url: string | null;
  photo_rotation: number;
}

function RiderPicker({
  riders,
  selectedRider,
  onSelect,
  onClear,
  canRotatePhotos,
  t,
}: {
  riders: RiderRow[];
  selectedRider: RiderRow | null;
  onSelect: (rider: RiderRow) => void;
  onClear: () => void;
  canRotatePhotos: boolean;
  t: (key: TranslationKey) => string;
}) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return riders
      .filter((r) =>
        [r.rider_name, r.iqama_number, r.id_number].some((v) =>
          (v ?? "").toLowerCase().includes(q),
        ),
      )
      .slice(0, 20);
  }, [riders, search]);

  if (selectedRider) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {selectedRider.photo_url ? (
            <RiderPhoto
              riderId={selectedRider.id}
              src={selectedRider.photo_url}
              alt={selectedRider.rider_name ?? ""}
              rotation={selectedRider.photo_rotation}
              canRotate={canRotatePhotos}
              className="h-8 w-8 shrink-0 rounded-full border border-border"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{selectedRider.rider_name || "—"}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {selectedRider.iqama_number || selectedRider.id_number || "—"}
            </div>
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("notifications.searchRiderPlaceholder")}
      />
      {search.trim() && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover shadow-md">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("notifications.searchNoResults")}
            </p>
          ) : (
            matches.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelect(r);
                  setSearch("");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm hover:bg-accent"
              >
                {r.photo_url ? (
                  <img
                    src={r.photo_url}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.rider_name || "—"}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {r.iqama_number || r.id_number || "—"}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AdminNotifications() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const isAdminFn = useServerFn(checkIsAdmin);
  const sendFn = useServerFn(sendRiderNotification);
  const dispatchPush = usePushDispatch();
  const listSentFn = useServerFn(listSentRiderNotifications);
  const deleteFn = useServerFn(deleteRiderNotification);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });

  const ridersQuery = useQuery({
    queryKey: ["company-riders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("riders")
        .select("id, iqama_number, id_number, rider_name, photo_url, photo_rotation")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as RiderRow[];
    },
  });

  const sentQuery = useQuery({
    queryKey: ["sent-rider-notifications"],
    queryFn: () => listSentFn(),
  });

  const [targetMode, setTargetMode] = useState<"all" | "specific">("all");
  const [kind, setKind] = useState<"notification" | "warning">("notification");
  const [selectedRider, setSelectedRider] = useState<RiderRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    if (targetMode === "specific" && !selectedRider) {
      return toast.error(t("notifications.toastSelectRider"));
    }
    setSending(true);
    try {
      const { id } = await sendFn({
        data: {
          targetRiderId: targetMode === "specific" ? selectedRider!.id : null,
          kind,
          title: title.trim(),
          body: body.trim(),
        },
      });
      dispatchPush({ source: "notification", id });
      toast.success(
        kind === "warning"
          ? t("notifications.toastSendWarningSuccess")
          : t("notifications.toastSendSuccess"),
      );
      setTitle("");
      setBody("");
      setSelectedRider(null);
      queryClient.invalidateQueries({ queryKey: ["sent-rider-notifications"] });
    } catch (err) {
      toast.error(errText(err, t("notifications.toastSendFailed")));
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await deleteFn({ data: { notificationId } });
      toast.success(t("notifications.toastDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["sent-rider-notifications"] });
    } catch (err) {
      toast.error(errText(err, t("notifications.toastDeleteFailed")));
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <Card>
        <CardHeader>
          <CardTitle>{t("notifications.pageTitle")}</CardTitle>
          <CardDescription>{t("notifications.pageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={targetMode === "all" ? "default" : "outline"}
                onClick={() => setTargetMode("all")}
              >
                <Users className="ms-1.5 h-3.5 w-3.5" />
                {t("notifications.targetAllButton")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={targetMode === "specific" ? "default" : "outline"}
                onClick={() => setTargetMode("specific")}
              >
                <User className="ms-1.5 h-3.5 w-3.5" />
                {t("notifications.targetSpecificButton")}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={kind === "notification" ? "default" : "outline"}
                onClick={() => setKind("notification")}
              >
                <Bell className="ms-1.5 h-3.5 w-3.5" />
                {t("notifications.kindNotificationButton")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kind === "warning" ? "destructive" : "outline"}
                onClick={() => setKind("warning")}
              >
                <AlertTriangle className="ms-1.5 h-3.5 w-3.5" />
                {t("notifications.kindWarningButton")}
              </Button>
            </div>

            {targetMode === "specific" && (
              <div className="space-y-1.5">
                <Label>{t("notifications.targetRiderLabel")}</Label>
                <RiderPicker
                  riders={ridersQuery.data ?? []}
                  selectedRider={selectedRider}
                  onSelect={setSelectedRider}
                  onClear={() => setSelectedRider(null)}
                  canRotatePhotos={adminCheck.data?.ridersAccess === "full"}
                  t={t}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("notifications.titleLabel")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("notifications.titlePlaceholder")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("notifications.bodyLabel")}</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("notifications.bodyPlaceholder")}
                rows={4}
                required
              />
            </div>
            <Button type="submit" disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="ms-1.5 h-4 w-4" />
                  {t("notifications.sendButton")}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("notifications.sentSectionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sentQuery.isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {sentQuery.data && sentQuery.data.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("notifications.sentEmpty")}
            </p>
          )}
          {sentQuery.data && sentQuery.data.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:text-xs">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[200px]">
                        {t("notifications.tableTitle")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("notifications.tableKind")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("notifications.tableTarget")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("notifications.tableDate")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("notifications.tableRead")}
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentQuery.data.map((n) => (
                      <TableRow key={n.notification_id}>
                        <TableCell>
                          <div className="font-medium">{n.title}</div>
                          <div className="line-clamp-1 text-xs text-muted-foreground">{n.body}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {n.kind === "warning" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {t("notifications.kindWarningBadge")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Bell className="h-3.5 w-3.5" />
                              {t("notifications.kindNotificationBadge")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {n.target_rider_id ? (
                            (n.target_rider_name ?? "—")
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Megaphone className="h-3.5 w-3.5" />
                              {t("notifications.targetAllBadge")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(n.created_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {n.read_count}/{n.target_count}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("notifications.deleteConfirmTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("notifications.deleteConfirmDesc")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(n.notification_id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t("admin.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
