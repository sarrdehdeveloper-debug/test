import { getTranslations } from "next-intl/server";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";
import type { SiteContentAccessor } from "@/lib/content";

const STEPS = ["step1", "step2", "step3"] as const;

export async function HowItWorks({ content: c }: { content: SiteContentAccessor }) {
  const t = await getTranslations("home.how");
  const numerals = t("numerals").split(",");
  return (
    <Section tone="parchment" aria-labelledby="how-title">
      <Heading id="how-title" eyebrow={t("eyebrow")} title={c.t("home.how.title")} />
      <div className="relative mt-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[16.6%] top-10 hidden h-px bg-[linear-gradient(90deg,transparent,rgb(164_111_38/0.55)_15%,rgb(164_111_38/0.55)_85%,transparent)] md:block"
        />
        <ol className="grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step} className="relative text-center">
              <div className="relative mx-auto grid size-20 place-items-center rounded-full border border-gold/50 bg-ivory shadow-card">
                <span
                  className="absolute inset-1.5 rounded-full border border-gold/25"
                  aria-hidden="true"
                />
                <span className="font-display text-2xl font-semibold text-gold-deep rtl:text-3xl">
                  {numerals[i] ?? i + 1}
                </span>
              </div>
              <h3 className="mt-6 font-serif text-2xl font-semibold text-fg">
                {c.t(`home.how.${step}.title`)}
              </h3>
              <p className="mx-auto mt-3 max-w-xs leading-relaxed text-muted">
                {c.t(`home.how.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
