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

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error(t("resetPassword.toastTooShort"));
    if (password !== confirm) return toast.error(t("resetPassword.toastMismatch"));
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("resetPassword.toastUpdated"));
    navigate({ to: "/admin" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 via-background to-background px-4">
      <Card className="animate-in fade-in slide-in-from-bottom-4 w-full max-w-md duration-500">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 hover:scale-105">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle>{t("resetPassword.title")}</CardTitle>
          <CardDescription>{t("resetPassword.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="animate-in fade-in py-8 text-center text-sm text-muted-foreground duration-300">
              {t("resetPassword.invalidLink")}
              <div className="mt-4">
                <Link to="/auth" className="text-primary transition-colors hover:underline">
                  {t("resetPassword.back")}
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-300"
            >
              <div className="space-y-2">
                <Label htmlFor="pw">{t("resetPassword.newPasswordLabel")}</Label>
                <div className="relative">
                  <Input
                    id="pw"
                    type={show ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute inset-y-0 left-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                    tabIndex={-1}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">{t("resetPassword.confirmPasswordLabel")}</Label>
                <Input
                  id="pw2"
                  type={show ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  dir="ltr"
                />
              </div>
              <Button
                type="submit"
                className="w-full transition-transform active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("resetPassword.updateButton")
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
