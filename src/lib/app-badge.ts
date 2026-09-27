// The service worker counts pushes that arrived while the app was closed and
// shows that number on the app icon. Opening the app is what "reads" them, so
// this resets both the icon and the worker's counter.
export function clearAppBadge() {
  try {
    void navigator.clearAppBadge?.();
  } catch {
    /* Badging API unsupported or blocked — nothing to clear */
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-badge" });
}
