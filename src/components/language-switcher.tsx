import { useLanguage } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div
      dir="ltr"
      className="fixed end-4 top-4 z-50 flex overflow-hidden rounded-full border border-border/60 bg-background/80 text-xs shadow-sm backdrop-blur"
    >
      <button
        type="button"
        onClick={() => setLang("ar")}
        className={`px-3 py-1.5 transition-colors ${
          lang === "ar"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        العربية
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`px-3 py-1.5 transition-colors ${
          lang === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        English
      </button>
    </div>
  );
}
