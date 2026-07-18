import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 via-background to-background px-4">
      <Card className="animate-in fade-in slide-in-from-bottom-4 w-full max-w-md duration-500">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 hover:scale-105">
            {/* <ShieldCheck className="h-6 w-6" /> */}
            <img src="/logo.png" alt="logo" />
          </div>
          <CardTitle>{t("auth.title")}</CardTitle>
          <CardDescription>
            {mode === "signin" ? t("auth.descSignin") : t("auth.descForgot")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "signin" ? (
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="pl-10"
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
              <Button
                type="submit"
                className="w-full transition-transform active:scale-[0.98]"
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
                className="w-full transition-transform active:scale-[0.98]"
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
