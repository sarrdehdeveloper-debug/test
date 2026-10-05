import { getTranslations } from "next-intl/server";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";
import type { SiteContentAccessor } from "@/lib/content";

const INDEXES = [1, 2, 3, 4, 5, 6] as const;

/** Escape for embedding JSON in a <script> tag. */
function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function Faq({ content: c }: { content: SiteContentAccessor }) {
  const t = await getTranslations("home.faq");
  const items = INDEXES.map((i) => ({
    q: c.t(`home.faq.q${i}`),
    a: c.t(`home.faq.a${i}`),
  })).filter((item) => item.q && item.a);
  if (items.length === 0) return null;

  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <Section tone="parchment" containerSize="narrow" aria-labelledby="faq-title">
      <Heading id="faq-title" eyebrow={t("eyebrow")} title={c.t("home.faq.title")} />
      <div className="mt-12 divide-y divide-line border-y border-line">
        {items.map((item, i) => (
          <details key={i} name="faq" className="group">
            <summary className="flex list-none items-center justify-between gap-6 py-5 text-start font-serif text-xl leading-snug font-semibold text-fg transition-colors hover:text-gold-deep sm:text-[1.4rem] [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/40 text-ornament transition-transform duration-300 group-open:rotate-45"
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </span>
            </summary>
            <p className="pe-4 pb-6 leading-relaxed text-muted sm:pe-14">{item.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
    </Section>
  );
}
