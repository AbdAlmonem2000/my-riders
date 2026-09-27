import { useState } from "react";
import { BellRing, Loader2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n";
import type { useRiderPush } from "@/lib/push-client";

const DISMISSED_KEY = "push-banner-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// One-time invitation on the rider's page to receive phone notifications.
// Hidden once they've turned them on, blocked them in the browser, or
// dismissed it.
export function PushBanner({ push }: { push: ReturnType<typeof useRiderPush> }) {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(readDismissed);

  const canOffer = push.available && !push.subscribed && !push.denied;
  if (dismissed || (!canOffer && !push.needsInstall)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* not persisted — the banner returns next visit */
    }
  };

  return (
    <Card className="animate-in fade-in slide-in-from-top-2 mb-6 border-primary/30 bg-primary/5 duration-500">
      <CardContent className="flex items-start gap-3 py-4">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {push.needsInstall ? (
            <Smartphone className="h-5 w-5" />
          ) : (
            <BellRing className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-sm font-semibold">{t("push.bannerTitle")}</div>
          <p className="text-sm text-muted-foreground">
            {push.needsInstall ? t("push.iosInstallHint") : t("push.bannerDesc")}
          </p>
          {canOffer && (
            <Button size="sm" onClick={push.enable} disabled={push.busy}>
              {push.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <BellRing className="ms-2 h-4 w-4" />
                  {t("push.enableButton")}
                </>
              )}
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          title={t("push.dismiss")}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}
