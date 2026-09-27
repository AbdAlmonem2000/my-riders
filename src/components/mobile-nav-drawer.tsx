import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useLanguage } from "@/lib/i18n";

// The sidebar on phones: a menu button that slides the page list in from the
// side the sidebar lives on (right in Arabic, left in English), and closes
// itself as soon as a page is picked. Desktop keeps its fixed sidebar.
export function MobileNavDrawer({ title, children }: { title: string; children: ReactNode }) {
  const { t, dir } = useLanguage();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden" title={t("nav.menu")}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side={dir === "rtl" ? "right" : "left"} className="w-72 overflow-y-auto">
        <SheetHeader className="pr-8 text-start">
          <SheetTitle className="truncate">{title}</SheetTitle>
          <SheetDescription className="sr-only">{t("nav.menu")}</SheetDescription>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-1">{children}</nav>
      </SheetContent>
    </Sheet>
  );
}
