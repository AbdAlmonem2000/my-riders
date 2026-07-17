import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function PwaInstallButton() {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosDialog, setShowIosDialog] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay());
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      toast.success(t("install.toastSuccess"));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [t]);

  if (isStandalone || (!deferredPrompt && !isIOS)) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    setShowIosDialog(true);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="fixed bottom-4 end-4 z-50 gap-1.5 rounded-full bg-background/90 shadow-md backdrop-blur"
      >
        <Download className="h-4 w-4" />
        {t("install.button")}
      </Button>

      <Dialog open={showIosDialog} onOpenChange={setShowIosDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("install.iosTitle")}</DialogTitle>
            <DialogDescription className="space-y-1 pt-2 text-start">
              <p>{t("install.iosStep1")}</p>
              <p>{t("install.iosStep2")}</p>
              <p>{t("install.iosStep3")}</p>
            </DialogDescription>
          </DialogHeader>
          <Button type="button" onClick={() => setShowIosDialog(false)}>
            {t("install.iosClose")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
