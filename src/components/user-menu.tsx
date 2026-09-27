import type { ReactNode } from "react";
import { Check, ChevronDown, Globe, LogOut, Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage, type Lang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

const LANGUAGES: { code: Lang; label: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
];

// The one account menu shared by the admin, super-admin and rider pages: a
// visible "Hello, <name>" button that opens the language switch, whatever
// page-specific actions the caller passes as `children`, and sign-out.
export function UserMenu({
  name,
  subtitle,
  onSignOut,
  children,
}: {
  name: string;
  subtitle?: string;
  onSignOut: () => void;
  children?: ReactNode;
}) {
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 gap-2 px-2 sm:px-3" title={t("menu.tooltip")}>
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {name.trim().charAt(0).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 items-center gap-1 truncate text-sm sm:flex">
            <span className="text-muted-foreground">{t("menu.greeting")}</span>
            <span className="truncate font-medium">{name}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-semibold">{name}</div>
          {subtitle && (
            <div className="truncate text-xs text-muted-foreground" dir="auto">
              {subtitle}
            </div>
          )}
        </DropdownMenuLabel>
        {children && (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          {t("menu.language")}
        </DropdownMenuLabel>
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            className="cursor-pointer justify-between"
            onClick={() => setLang(l.code)}
          >
            <span dir={l.dir}>{l.label}</span>
            {lang === l.code && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" />
          {t("admin.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
