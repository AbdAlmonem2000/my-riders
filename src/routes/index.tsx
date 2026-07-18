import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    navigate({ to: "/rider/$iqama", params: { iqama: q } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="animate-in fade-in slide-in-from-top-2 border-b border-border/50 bg-background/60 backdrop-blur duration-500">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-300 hover:scale-105">
              <img src="/logo.png" alt="logo" />
            </div>
            <span className="font-semibold">{t("index.headerTitle")}</span>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShieldCheck className="h-4 w-4" />
            {t("index.adminLogin")}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-20 text-center">
        <div className="animate-in fade-in slide-in-from-bottom-2 mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-xs text-muted-foreground duration-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          {t("index.liveBadge")}
        </div>
        <h1 className="animate-in fade-in slide-in-from-bottom-3 text-4xl font-bold tracking-tight text-foreground duration-700 sm:text-5xl">
          {t("index.heroTitle")}
        </h1>
        <p className="animate-in fade-in slide-in-from-bottom-3 mt-4 max-w-xl text-base text-muted-foreground duration-700 [animation-delay:100ms] fill-mode-[backwards]">
          {t("index.heroDesc")}
        </p>

        <form
          onSubmit={submit}
          className="animate-in fade-in slide-in-from-bottom-4 mt-10 flex w-full max-w-xl flex-col gap-3 duration-700 [animation-delay:150ms] fill-mode-[backwards] sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("index.searchPlaceholder")}
              className="h-12 pr-10 text-base transition-shadow focus-visible:shadow-md"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="h-12 px-8 transition-transform active:scale-[0.98]"
          >
            {t("index.searchButton")}
          </Button>
        </form>

        <div className="mt-16 grid w-full max-w-2xl gap-4 sm:grid-cols-1">
          {[
            { title: t("index.featureMonthlyTitle"), desc: t("index.featureMonthlyDesc") },
            { title: t("index.featureFullTitle"), desc: t("index.featureFullDesc") },
            { title: t("index.featureSecureTitle"), desc: t("index.featureSecureDesc") },
            { title: t("index.QulityTitle"), desc: t("index.QulityDesc") },
          ].map((it, i) => (
            <div
              key={it.title}
              className="animate-in fade-in slide-in-from-bottom-4 rounded-xl border border-border/60 bg-card p-4 text-start transition-all duration-500 fill-mode-[backwards] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              style={{ animationDelay: `${200 + i * 100}ms` }}
            >
              <div className="text-sm font-semibold text-foreground">{it.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{it.desc}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
