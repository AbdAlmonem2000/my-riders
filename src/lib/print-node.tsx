import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Prints (or "downloads as PDF" via the browser's print-to-PDF option) any
// node. It's rendered into a hidden portal on document.body — never inside
// whatever the caller normally puts it in (e.g. a shadcn Dialog, which
// positions its content with `position: fixed`) — because Chrome renders
// print output blank for anything nested inside a fixed-position ancestor.
// Each call gets its own id via useId(), so several printable nodes (an open
// dialog next to a live preview) can be mounted at once without colliding.
//
// `@page { margin: 0 }` is what actually suppresses Chrome's default print
// header/footer (the date/time + page URL) — Chrome only offers that
// header/footer when there's page margin to print it into, so a zero
// margin greys out the "Headers and footers" option entirely. document.title
// is blanked too, as a fallback for browsers where that trick doesn't apply.
export function usePrintNode(node: ReactNode) {
  const rawId = useId();
  const printId = `print-node-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const print = () => {
    const style = document.createElement("style");
    // Hides every other body-level element outright (display: none) rather
    // than just making them invisible — a visibility-only version leaves
    // hidden elements' layout height in place, which spills the print
    // output onto a second, blank page. With display:none removed from the
    // flow, the printed page is sized by the target node alone.
    style.textContent = `
@page {
  margin: 0;
}
@media print {
  body > *:not(#${printId}) { display: none !important; }
  #${printId} { display: block !important; margin: 0; width: 100%; }
}`;
    document.head.appendChild(style);
    const previousTitle = document.title;
    document.title = "";
    const cleanup = () => {
      style.remove();
      document.title = previousTitle;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // Some browsers never fire afterprint (e.g. the print dialog is
    // cancelled in certain WebViews) — clean up regardless after a beat.
    setTimeout(cleanup, 3000);
  };

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <div id={printId} style={{ display: "none" }}>
            {node}
          </div>,
          document.body,
        )
      : null;

  return { portal, print };
}
