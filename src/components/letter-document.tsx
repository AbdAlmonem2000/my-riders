import { formatDate } from "@/lib/date-format";
import { usePrintNode } from "@/lib/print-node";
import type { TranslationKey } from "@/lib/i18n";

export interface LetterAssets {
  companyName: string;
  companyLogoUrl: string | null;
  companyStampUrl: string | null;
  companySignatureUrl: string | null;
  companyUnifiedNumber: string | null;
  companyCommercialRegistration: string | null;
  includeStamp: boolean;
  includeSignature: boolean;
}

export interface LetterContent {
  title: string;
  body: string;
  letterDate: string;
}

export function LetterDocument({
  assets,
  content,
  t,
}: {
  assets: LetterAssets;
  content: LetterContent;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-background p-8 text-foreground shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          {assets.companyLogoUrl && (
            <img
              src={assets.companyLogoUrl}
              alt={assets.companyName}
              className="h-10 w-10 shrink-0 object-contain"
            />
          )}
          <div>
            <div className="text-base font-bold">{assets.companyName}</div>
            {(assets.companyCommercialRegistration || assets.companyUnifiedNumber) && (
              <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[10px] text-muted-foreground">
                {assets.companyCommercialRegistration && (
                  <span>
                    {t("letters.crLabel")}{" "}
                    <span dir="ltr" className="font-mono">
                      {assets.companyCommercialRegistration}
                    </span>
                  </span>
                )}
                {assets.companyUnifiedNumber && (
                  <span>
                    {t("letters.unifiedNumberLabel")}{" "}
                    <span dir="ltr" className="font-mono">
                      {assets.companyUnifiedNumber}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {content.letterDate && formatDate(content.letterDate)}
        </div>
      </div>

      <h2 className="mt-4 text-center text-lg font-bold">{content.title}</h2>

      <p className="mt-4 whitespace-pre-wrap leading-relaxed">{content.body}</p>

      {(assets.includeStamp || assets.includeSignature) && (
        <div className="mt-12 flex items-end justify-end gap-8">
          {assets.includeSignature && assets.companySignatureUrl && (
            <div className="text-center">
              {/* A signature is naturally a wide, short mark — bound by
                  height AND width so an oddly-shaped source image can't
                  blow up out of proportion on the page. */}
              <img
                src={assets.companySignatureUrl}
                alt=""
                className="h-20 max-w-48 object-contain"
              />
              <div className="mt-1 text-xs text-muted-foreground">
                {t("letters.signatureLabel")}
              </div>
            </div>
          )}
          {assets.includeStamp && assets.companyStampUrl && (
            <div className="text-center">
              {/* Official stamps are round/square and roughly life-size
                  (~3-4cm) on a printed page — a square box at this size
                  prints close to that at the browser's default 100% print
                  scale (~96px per inch). */}
              <img src={assets.companyStampUrl} alt="" className="h-32 w-32 object-contain" />
              <div className="mt-1 text-xs text-muted-foreground">{t("letters.stampLabel")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The print/PDF mechanism is generic (any node), so it lives in a shared
// helper — this name is kept as the letters call sites' import.
export const useLetterPrint = usePrintNode;
