import { Link } from "@tanstack/react-router";
import { Info, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

const LINKS: {
  to: "/" | "/about" | "/auth";
  key: TranslationKey;
  icon: LucideIcon;
  // The brand already leads home, so on phones the lookup link would only
  // crowd the bar.
  hideOnMobile?: boolean;
}[] = [
  { to: "/", key: "index.lookup", icon: Search, hideOnMobile: true },
  { to: "/auth", key: "index.adminLogin", icon: ShieldCheck },
  { to: "/about", key: "index.about", icon: Info },
];

// The underline is a bar under the link that grows out from its centre: half
// way on hover, full width while pressed and for the current page. The link
// itself dips slightly when pressed.
const UNDERLINE_LINK =
  "relative items-center gap-1.5 whitespace-nowrap py-1 text-sm font-medium text-muted-foreground transition-[color,scale] duration-200 hover:text-foreground active:scale-95 motion-reduce:transition-none " +
  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-50 active:after:scale-x-100 motion-reduce:after:transition-none";

// The bar shared by every page outside the signed-in areas (home, about,
// admin login, password reset), pinned to the top so it stays put while
// scrolling and doesn't change from page to page. The current page's link is
// highlighted and underlined.
export function PublicHeader() {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo className="transition-transform duration-300 hover:scale-105" />
          <span className="font-semibold">{t("index.headerTitle")}</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-5">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: true }}
              className={`${UNDERLINE_LINK} ${link.hideOnMobile ? "hidden sm:inline-flex" : "inline-flex"}`}
              activeProps={{ className: "!text-foreground after:!scale-x-100" }}
            >
              <link.icon className="h-4 w-4" />
              {t(link.key)}
            </Link>
          ))}
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
