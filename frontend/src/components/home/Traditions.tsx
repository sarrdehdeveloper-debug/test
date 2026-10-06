import { getTranslations } from "next-intl/server";
import { Sparkle, YinYang } from "@/components/decor/Ornament";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Section } from "@/components/ui/Section";
import { AnimalIcon } from "@/components/zodiac/AnimalIcon";
import { SIGN_GLYPHS } from "@/components/zodiac/data";
import type { SiteContentAccessor } from "@/lib/content";
import type { ReactNode } from "react";

function Medallion({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto grid size-20 place-items-center rounded-full border border-gold/40 bg-[radial-gradient(circle_at_30%_25%,rgb(233_199_123/0.35),transparent_70%)] text-ornament">
      <span
        className="absolute inset-1.5 rounded-full border border-dashed border-gold/30"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

export async function Traditions({ content: c }: { content: SiteContentAccessor }) {
  const t = await getTranslations("home.traditions");
  const cards = [
    {
      key: "western",
      icon: (
        <span
          aria-hidden="true"
          className="font-[family-name:var(--font-symbol)] text-[2.4rem] leading-none text-gold"
        >
          {SIGN_GLYPHS.leo}
        </span>
      ),
      title: c.t("home.traditions.western.title"),
      body: c.t("home.traditions.western.body"),
    },
    {
      key: "blend",
      icon: <YinYang className="size-11 text-gold" />,
      title: c.t("home.traditions.blend.title"),
      body: c.t("home.traditions.blend.body"),
      featured: true,
    },
    {
      key: "chinese",
      icon: <AnimalIcon animal="dragon" bare size="lg" className="text-gold" />,
      title: c.t("home.traditions.chinese.title"),
      body: c.t("home.traditions.chinese.body"),
    },
  ];

  return (
    <Section tone="ivory" aria-labelledby="traditions-title">
      <Heading id="traditions-title" eyebrow={t("eyebrow")} title={c.t("home.traditions.title")} />
      <ul className="mt-14 grid gap-6 md:grid-cols-3 md:gap-7">
        {cards.map((card) => (
          <li key={card.key} className="flex">
            <Card
              variant={card.featured ? "featured" : "default"}
              padding="lg"
              className="flex w-full flex-col items-center text-center"
            >
              {card.featured ? (
                <Sparkle className="absolute top-5 end-5 size-3.5 text-gold-light" />
              ) : null}
              <Medallion>{card.icon}</Medallion>
              <h3 className="mt-6 font-serif text-2xl font-semibold text-fg">{card.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{card.body}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
