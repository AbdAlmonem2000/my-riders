import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ABOUT_ANYWHERE,
  ABOUT_AUDIENCE,
  ABOUT_CTA,
  ABOUT_FAQ,
  ABOUT_FEATURES,
  ABOUT_FEATURES_TITLE,
  ABOUT_HERO,
  ABOUT_HIGHLIGHTS,
  ABOUT_PROBLEM,
  ABOUT_SECURITY,
  ABOUT_STEPS,
} from "@/lib/about-content";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "عن النظام | نظام مندوبي" },
      {
        name: "description",
        content:
          "تعرّف على نظام مندوبي: منصة متكاملة لشركات التشغيل اللوجستي لإدارة تقارير المناديب ومستنداتهم وخطاباتهم وإشعاراتهم.",
      },
    ],
  }),
  component: AboutPage,
});

function SectionHeading({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-primary" />
      {desc && <p className="mt-4 text-muted-foreground">{desc}</p>}
    </div>
  );
}

function AboutPage() {
  const { lang } = useLanguage();

  return (
    <div className="relative min-h-[calc(100vh-4.25rem)] overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Decorative drifting blobs — purely visual, so they're pulled out of
          the tab order and frozen for anyone who prefers reduced motion. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
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

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <div className="animate-in fade-in slide-in-from-bottom-2 mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-xs text-muted-foreground duration-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            {ABOUT_HERO.badge[lang]}
          </div>
          <h1 className="animate-in fade-in slide-in-from-bottom-3 text-4xl font-bold leading-tight tracking-tight text-foreground duration-700 sm:text-5xl">
            {ABOUT_HERO.title[lang]}
          </h1>
          <p className="animate-in fade-in slide-in-from-bottom-3 mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground duration-700 [animation-delay:100ms] fill-mode-[backwards]">
            {ABOUT_HERO.desc[lang]}
          </p>
          <div className="animate-in fade-in slide-in-from-bottom-4 mt-9 flex flex-wrap justify-center gap-3 duration-700 [animation-delay:200ms] fill-mode-[backwards]">
            <Button asChild size="lg" className="h-12 px-8">
              <Link to="/auth">{ABOUT_HERO.primaryCta[lang]}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8">
              <Link to="/">{ABOUT_HERO.secondaryCta[lang]}</Link>
            </Button>
          </div>
        </section>

        {/* Highlights */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ABOUT_HIGHLIGHTS.map((item, i) => (
              <div
                key={item.label.en}
                className="animate-in fade-in slide-in-from-bottom-3 flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 duration-500 fill-mode-[backwards]"
                style={{ animationDelay: `${300 + i * 80}ms` }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium">{item.label[lang]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Problem → solution */}
        <section className="border-y border-border/50 bg-muted/40 py-20">
          <div className="mx-auto max-w-5xl px-6">
            <SectionHeading title={ABOUT_PROBLEM.title[lang]} desc={ABOUT_PROBLEM.intro[lang]} />
            <div className="grid gap-4 md:grid-cols-2">
              {ABOUT_PROBLEM.pains.map((pain) => (
                <div
                  key={pain.problem.en}
                  className="rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="text-sm text-muted-foreground line-through decoration-destructive/40">
                    {pain.problem[lang]}
                  </p>
                  <div className="mt-3 flex items-start gap-2">
                    <ArrowLeft className="mt-0.5 h-4 w-4 shrink-0 text-primary rtl:rotate-0 ltr:rotate-180" />
                    <p className="font-medium text-foreground">{pain.solution[lang]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading title={ABOUT_AUDIENCE.title[lang]} />
          <div className="grid gap-5 md:grid-cols-3">
            {ABOUT_AUDIENCE.items.map((item) => (
              <div
                key={item.title.en}
                className="rounded-2xl border border-border/60 bg-card p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <item.icon className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold">{item.title[lang]}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.desc[lang]}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-border/50 bg-muted/40 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeading
              title={ABOUT_FEATURES_TITLE.title[lang]}
              desc={ABOUT_FEATURES_TITLE.desc[lang]}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              {ABOUT_FEATURES.map((feature) => (
                <article
                  key={feature.title.en}
                  className="flex flex-col rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-semibold leading-snug">{feature.title[lang]}</h3>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {feature.intro[lang]}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {feature.points.map((point) => (
                      <li key={point.en} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        <span className="leading-relaxed">{point[lang]}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading title={ABOUT_STEPS.title[lang]} />
          <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {ABOUT_STEPS.items.map((step, i) => (
              <li
                key={step.title.en}
                className="relative rounded-2xl border border-border/60 bg-card p-6 pt-10"
              >
                <span className="absolute -top-5 start-6 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-md">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{step.title[lang]}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.desc[lang]}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Security */}
        <section className="bg-primary py-20 text-primary-foreground">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <ShieldCheck className="mx-auto mb-4 h-10 w-10 opacity-90" />
              <h2 className="text-3xl font-bold tracking-tight">{ABOUT_SECURITY.title[lang]}</h2>
              <p className="mt-4 text-primary-foreground/80">{ABOUT_SECURITY.desc[lang]}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ABOUT_SECURITY.items.map((item) => (
                <div
                  key={item.title.en}
                  className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5"
                >
                  <h3 className="font-semibold">{item.title[lang]}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">
                    {item.desc[lang]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Works anywhere */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <SectionHeading title={ABOUT_ANYWHERE.title[lang]} />
          <ul className="grid gap-3 sm:grid-cols-2">
            {ABOUT_ANYWHERE.points.map((point) => (
              <li
                key={point.en}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4"
              >
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary rtl:rotate-180" />
                <span className="text-sm leading-relaxed">{point[lang]}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="border-t border-border/50 bg-muted/40 py-20">
          <div className="mx-auto max-w-3xl px-6">
            <SectionHeading title={ABOUT_FAQ.title[lang]} />
            <Accordion type="single" collapsible className="rounded-2xl border bg-card px-6">
              {ABOUT_FAQ.items.map((item, i) => (
                <AccordionItem key={item.q.en} value={`faq-${i}`}>
                  <AccordionTrigger className="text-start">{item.q[lang]}</AccordionTrigger>
                  <AccordionContent className="leading-relaxed text-muted-foreground">
                    {item.a[lang]}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">{ABOUT_CTA.title[lang]}</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{ABOUT_CTA.desc[lang]}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-8">
              <Link to="/auth">{ABOUT_HERO.primaryCta[lang]}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8">
              <Link to="/">{ABOUT_HERO.secondaryCta[lang]}</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
