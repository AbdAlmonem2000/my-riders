// The one "نظام مندوبي" logo mark, used everywhere it appears (the public
// header, the sign-in page, the rider's own page) — same size and shape in
// every one of them, so the brand never looks bigger on one page than
// another. `className` only ever adds spacing/motion/hover treatment on top
// of this fixed box; it never resizes it.
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground ${className}`}
    >
      <img src="/logo.png" alt="" className="h-full w-full rounded-lg object-contain p-1.5" />
    </div>
  );
}
