import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useLanguage } from "@/lib/i18n";

// A small icon toggle for the light/dark theme, meant to sit right next to
// the language switcher wherever that appears (the public header, the
// signed-in account menu). The icon itself crossfades/rotates between sun
// and moon instead of just swapping instantly.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={t("theme.toggleTooltip")}
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-background/80 shadow-sm backdrop-blur transition-colors hover:bg-accent ${className}`}
    >
      <Sun
        className={`absolute h-4 w-4 text-muted-foreground transition-all duration-300 ${
          isDark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
      <Moon
        className={`absolute h-4 w-4 text-muted-foreground transition-all duration-300 ${
          isDark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
        }`}
      />
    </button>
  );
}
