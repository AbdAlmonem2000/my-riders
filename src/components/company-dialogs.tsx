import { useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadCompanyLogo } from "@/lib/company-logo";
import type { TranslationKey } from "@/lib/i18n";

// Shared between the super-admin (any company) and company-admin (their
// own company only) dashboards — the server functions these call decide
// who's allowed to edit which company, this is just the form.

export function ChangeNameDialog({
  currentName,
  onSubmit,
  t,
}: {
  currentName: string;
  onSubmit: (name: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onSubmit(name.trim());
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setName(currentName);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.changeNameTitle")}
          className="transition-transform hover:scale-110"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("superAdmin.changeNameTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("superAdmin.newCompanyNameLabel")}
            maxLength={120}
            required
            autoFocus
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="transition-transform active:scale-[0.98]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("superAdmin.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeLogoDialog({
  companyName,
  currentLogoUrl,
  onSubmit,
  t,
}: {
  companyName: string;
  currentLogoUrl: string | null;
  onSubmit: (logoUrl: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t("superAdmin.toastChooseLogo"));
    setLoading(true);
    try {
      const logoUrl = await uploadCompanyLogo(file);
      await onSubmit(logoUrl);
      setOpen(false);
      setFile(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setFile(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t("superAdmin.changeLogoTitle")}
          className="transition-transform hover:scale-110"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{companyName}</DialogTitle>
          <DialogDescription>{t("superAdmin.logoDialogDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {currentLogoUrl && (
            <img
              src={currentLogoUrl}
              alt={companyName}
              className="h-16 w-16 rounded border border-border object-contain"
            />
          )}
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || !file}
              className="transition-transform active:scale-[0.98]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("superAdmin.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
