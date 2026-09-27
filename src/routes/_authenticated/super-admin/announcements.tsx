import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
} from "@/lib/announcements.functions";
import { formatDate } from "@/lib/date-format";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/super-admin/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const listAnnouncementsFn = useServerFn(listAnnouncements);
  const createAnnouncementFn = useServerFn(createAnnouncement);
  const deleteAnnouncementFn = useServerFn(deleteAnnouncement);

  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncementsFn(),
  });

  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const createAnnouncementMut = useMutation({
    mutationFn: () =>
      createAnnouncementFn({ data: { title: announceTitle.trim(), body: announceBody.trim() } }),
    onSuccess: () => {
      toast.success(t("superAdmin.toastAnnouncementSent"));
      setAnnounceTitle("");
      setAnnounceBody("");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAnnouncementMut = useMutation({
    mutationFn: (id: string) => deleteAnnouncementFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("superAdmin.toastAnnouncementDeleted"));
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-[backwards]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          {t("superAdmin.announcementsCardTitle")}
        </CardTitle>
        <CardDescription>{t("superAdmin.announcementsCardDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!announceTitle.trim() || !announceBody.trim()) return;
            createAnnouncementMut.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>{t("superAdmin.announcementTitleLabel")}</Label>
            <Input
              value={announceTitle}
              onChange={(e) => setAnnounceTitle(e.target.value)}
              placeholder={t("superAdmin.announcementTitlePlaceholder")}
              maxLength={150}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("superAdmin.announcementBodyLabel")}</Label>
            <Textarea
              value={announceBody}
              onChange={(e) => setAnnounceBody(e.target.value)}
              placeholder={t("superAdmin.announcementBodyPlaceholder")}
              maxLength={2000}
              rows={3}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={createAnnouncementMut.isPending}
            className="transition-transform active:scale-[0.98]"
          >
            {createAnnouncementMut.isPending ? (
              <>
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                {t("superAdmin.sending")}
              </>
            ) : (
              <>
                <Send className="ms-2 h-4 w-4" />
                {t("superAdmin.sendButton")}
              </>
            )}
          </Button>
        </form>

        {announcements.data && announcements.data.announcements.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("superAdmin.announcementsHistoryTitle")}
            </p>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {announcements.data.announcements.map((a) => (
                <div key={a.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{a.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(a.createdAt)}
                      </span>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-destructive transition-transform hover:scale-110"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("superAdmin.deleteAnnouncementTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("superAdmin.deleteAnnouncementDesc")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteAnnouncementMut.mutate(a.id)}
                            >
                              {t("admin.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
