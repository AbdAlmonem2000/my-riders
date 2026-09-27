import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.toastSignInSuccess"));
    // /admin auto-redirects super admins to /super-admin
    navigate({ to: "/admin" });
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.toastResetSent"));
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4.25rem)] items-center justify-center overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background px-4">
      {/* Decorative drifting blobs — purely visual, so they're pulled out of
          the tab order and frozen for anyone who prefers reduced motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-blob absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[oklch(0.6_0.118_184.704)]/25 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="animate-blob absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-[oklch(0.627_0.265_303.9)]/20 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="animate-blob absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-primary/15 blur-3xl motion-reduce:animate-none"
          style={{ animationDelay: "-10s" }}
        />
      </div>

      <Card className="animate-in fade-in slide-in-from-bottom-4 zoom-in-95 relative w-full max-w-md border-border/60 bg-card/90 shadow-xl backdrop-blur-sm duration-500">
        <CardHeader className="text-center">
          <div className="animate-float motion-reduce:animate-none">
            <BrandLogo className="mx-auto mb-3 shadow-md transition-transform duration-300 hover:scale-110" />
          </div>
          <CardTitle className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {t("auth.title")}
          </CardTitle>
          <CardDescription
            className="animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ animationDelay: "80ms" }}
          >
            {mode === "signin" ? t("auth.descSignin") : t("auth.descForgot")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "signin" ? (
            <form onSubmit={signIn} className="space-y-4">
              <div
                className="animate-in fade-in slide-in-from-bottom-2 space-y-2 duration-500 fill-mode-[backwards]"
                style={{ animationDelay: "120ms" }}
              >
                <Label htmlFor="email">{t("auth.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
              <div
                className="animate-in fade-in slide-in-from-bottom-2 space-y-2 duration-500 fill-mode-[backwards]"
                style={{ animationDelay: "180ms" }}
              >
                <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="pl-10 transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 left-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div
                className="animate-in fade-in slide-in-from-bottom-2 space-y-3 duration-500 fill-mode-[backwards]"
                style={{ animationDelay: "240ms" }}
              >
                <Button
                  type="submit"
                  className="w-full transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] active:shadow-none"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.signInButton")}
                </Button>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("auth.forgotPassword")}
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={sendReset}
              className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-300"
            >
              <div className="space-y-2">
                <Label htmlFor="email-reset">{t("auth.emailLabel")}</Label>
                <Input
                  id="email-reset"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                />
              </div>
              <Button
                type="submit"
                className="w-full transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] active:shadow-none"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.sendResetButton")}
              </Button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("auth.backToSignin")}
              </button>
            </form>
          )}
          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("auth.backToLookup")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
