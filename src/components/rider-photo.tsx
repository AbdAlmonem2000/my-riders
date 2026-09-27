import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { errText } from "@/lib/error-text";
import { useLanguage } from "@/lib/i18n";
import { updateRiderPhotoRotation } from "@/lib/riders.functions";

type Rotation = 0 | 90 | 180 | 270;

function normalizeRotation(deg: number): Rotation {
  return (((deg % 360) + 360) % 360) as Rotation;
}

// A rider's photo, wherever it's shown (roster, documents, letters, the
// rider's own page, …): click it to see it full-size in a lightbox, with
// left/right rotate buttons for a photo that was saved sideways or upside
// down. The rotation is saved to that rider's record — the same for every
// page and every viewer — instead of resetting each time it's reopened.
//
// className is the same sizing/shape classes the plain <img> it replaces
// would have carried (e.g. "h-9 w-9 rounded-full border").
export function RiderPhoto({
  riderId,
  src,
  alt,
  rotation = 0,
  canRotate = false,
  className,
}: {
  riderId: string;
  src: string;
  alt: string;
  rotation?: number;
  // Rotating writes to the rider's record, which requires the same
  // company-side authorization editing a rider does — off by default so a
  // page with no such session (the rider's own public page) never renders
  // a control it has no way to save.
  canRotate?: boolean;
  className: string;
}) {
  const { t } = useLanguage();
  const updateRotationFn = useServerFn(updateRiderPhotoRotation);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Rotation>(normalizeRotation(rotation));
  const [saving, setSaving] = useState(false);

  // The saved rotation can change from outside (a refetch after someone
  // else rotates it, or after this page's own query refreshes).
  useEffect(() => {
    setCurrent(normalizeRotation(rotation));
  }, [rotation]);

  // A 90°/270° rotation swaps the photo's visual width and height, so the
  // size caps below swap with it — otherwise a portrait photo rotated
  // sideways would spill past the dialog's edges.
  const rotated90 = current % 180 !== 0;

  // Rider photos can live anywhere an admin pasted a link (roster sheet,
  // rider form) — not just our own storage — so a plain <a download> or a
  // client-side fetch() often can't force a save: the browser only allows
  // that for same-origin (or CORS-friendly) sources. When the source blocks
  // it, fall back to opening the photo in a new tab so it can be saved by
  // hand instead of just showing a dead-end error.
  const downloadPhoto = async () => {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      // Only the filename's own extension, never a dot from the domain
      // (e.g. ".co") or a query string.
      const filename = new URL(src, window.location.origin).pathname.split("/").pop() ?? "";
      const dotIndex = filename.lastIndexOf(".");
      const ext = dotIndex > 0 ? filename.slice(dotIndex + 1) : "";
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${alt || "rider"}${ext ? `.${ext}` : ""}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(src, "_blank");
      toast.info(t("photo.downloadOpenedNewTab"));
    }
  };

  const rotate = async (delta: 90 | -90) => {
    const previous = current;
    const next = normalizeRotation(current + delta);
    setCurrent(next);
    setSaving(true);
    try {
      await updateRotationFn({ data: { riderId, rotation: next } });
    } catch (err) {
      setCurrent(previous);
      toast.error(errText(err, t("photo.rotateFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("photo.zoomTooltip")}
        className={`${className} cursor-zoom-in overflow-hidden transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
      >
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          style={{ transform: `rotate(${current}deg)` }}
          loading="lazy"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* The rotate buttons are a sibling of the scrollable image area, not
            inside it — a giant photo can make the image itself scroll, but
            it can never push the buttons out of view along with it. */}
        <DialogContent className="flex max-h-[95vh] w-fit max-w-[96vw] flex-col gap-4 border-none bg-black/95 p-6 text-white shadow-2xl sm:rounded-2xl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            <img
              src={src}
              alt={alt}
              className="rounded-lg object-contain transition-transform duration-300"
              style={{
                transform: `rotate(${current}deg)`,
                maxHeight: rotated90 ? "88vw" : "84vh",
                maxWidth: rotated90 ? "84vh" : "88vw",
              }}
            />
          </div>
          <div className="flex shrink-0 justify-center gap-2">
            {canRotate && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  title={t("photo.rotateLeftButton")}
                  disabled={saving}
                  onClick={() => rotate(-90)}
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="sr-only">{t("photo.rotateLeftButton")}</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  title={t("photo.rotateRightButton")}
                  disabled={saving}
                  onClick={() => rotate(90)}
                >
                  <RotateCw className="h-4 w-4" />
                  <span className="sr-only">{t("photo.rotateRightButton")}</span>
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              title={t("photo.downloadTooltip")}
              onClick={downloadPhoto}
            >
              <Download className="h-4 w-4" />
              <span className="sr-only">{t("photo.downloadTooltip")}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
