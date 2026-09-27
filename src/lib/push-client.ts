import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { dispatchRiderPush, getPushPublicKey } from "@/lib/rider-push.functions";

const SUBSCRIBED_RIDER_KEY = "push-rider-id";

function browserSupportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function isIosOutsideApp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

// Company side: after saving something a rider should hear about, push it to
// their phones. Runs in the background so the admin isn't kept waiting, and a
// failure never surfaces as an error — the action itself already succeeded.
// The server sends one page of devices per call; this keeps calling until it
// reports there's no more.
export function usePushDispatch() {
  const dispatchFn = useServerFn(dispatchRiderPush);
  return useCallback(
    (input: { source: "notification" | "report" | "letter"; id: string; updated?: boolean }) => {
      void (async () => {
        try {
          let after: string | null = null;
          do {
            const res: { after: string | null } = await dispatchFn({ data: { ...input, after } });
            after = res.after;
          } while (after);
        } catch (err) {
          console.warn("push dispatch failed", err);
        }
      })();
    },
    [dispatchFn],
  );
}

// Rider side: whether this device can receive pushes for this rider, and the
// switches to turn them on and off.
export function useRiderPush(riderId: string | null, password: string) {
  const { t } = useLanguage();
  const getKeyFn = useServerFn(getPushPublicKey);
  const keyQuery = useQuery({
    queryKey: ["push-public-key"],
    queryFn: () => getKeyFn(),
    staleTime: Infinity,
  });
  const publicKey = keyQuery.data?.publicKey ?? null;

  const [supported, setSupported] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canPush = browserSupportsPush();
    setSupported(canPush);
    setNeedsInstall(!canPush && isIosOutsideApp());
    if (!canPush) return;
    setPermission(Notification.permission);
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        let mine = false;
        try {
          mine = localStorage.getItem(SUBSCRIBED_RIDER_KEY) === riderId;
        } catch {
          /* storage blocked — treated as not subscribed */
        }
        setSubscribed(!!sub && mine);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [riderId]);

  const enable = useCallback(async () => {
    if (!riderId || !publicKey) return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error(t("push.toastDenied"));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        }));
      const keys = sub.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) throw new Error("missing push keys");
      const { error } = await supabase.rpc("register_rider_push", {
        _rider_id: riderId,
        _endpoint: sub.endpoint,
        _p256dh: keys.p256dh,
        _auth: keys.auth,
        _password: password || undefined,
      });
      if (error) throw error;
      try {
        localStorage.setItem(SUBSCRIBED_RIDER_KEY, riderId);
      } catch {
        /* storage blocked — the subscription still works */
      }
      setSubscribed(true);
      toast.success(t("push.toastEnabled"));
    } catch (err) {
      console.error("enable push failed", err);
      toast.error(t("push.toastFailed"));
    } finally {
      setBusy(false);
    }
  }, [riderId, publicKey, password, t]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc("unregister_rider_push", { _endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      try {
        localStorage.removeItem(SUBSCRIBED_RIDER_KEY);
      } catch {
        /* nothing stored to clear */
      }
      setSubscribed(false);
      toast.success(t("push.toastDisabled"));
    } catch (err) {
      console.error("disable push failed", err);
      toast.error(t("push.toastFailed"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  return {
    // The server has push configured and this browser can use it.
    available: !!publicKey && supported,
    // iPhone Safari outside the installed app can't do push at all yet.
    needsInstall: !!publicKey && needsInstall,
    denied: permission === "denied",
    subscribed,
    busy,
    enable,
    disable,
  };
}
