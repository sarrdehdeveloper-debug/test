"use client";

import { useTranslations } from "next-intl";
import type { ReactNode, Ref } from "react";
import { Ornament, Sparkle, YinYang } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { Alert } from "@/components/ui/Alert";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AnimalIcon, ElementIcon } from "@/components/zodiac/AnimalIcon";
import { SignIcon } from "@/components/zodiac/SignIcon";
import { animalPolarity, signQualities } from "@/lib/flows/zodiac";
import type { FreeReadingResult, ReadingBlock } from "@/lib/types";

export interface BlendResultProps {
  result: FreeReadingResult;
  headingRef: Ref<HTMLHeadingElement>;
  priceLabel: string;
  onRestart: () => void;
}

/** "Your blend" card, cusp notices, the two readings and the upsell to the full report. */
export function BlendResult({ result, headingRef, priceLabel, onRestart }: BlendResultProps) {
  const t = useTranslations("free.result");
  const tz = useTranslations("zodiac");
  const tc = useTranslations("common");
  const { signs, sign_reading: signReading, animal_reading: animalReading } = result;

  const sign = tz(`signs.${signs.sun_sign}`);
  const animal = tz(`animals.${signs.year_animal}`);
  const polarity = tz(`polarity.${animalPolarity(signs.year_animal)}`);
  const element = tz(`elements.${signs.year_element}`);
  const qualities = signQualities(signs.sun_sign);

  return (
    <div className="mx-auto max-w-5xl space-y-8 sm:space-y-10">
      <Card
        variant="featured"
        padding="none"
        data-tone="night"
        className="isolate animate-fade-up overflow-hidden px-5 py-10 text-center sm:px-10 sm:py-14"
      >
        <StarField density="low" seed={5} className="-z-10 rounded-2xl opacity-80" />
        <p className="eyebrow">{t("eyebrow")}</p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 scroll-mt-28 font-serif text-3xl leading-tight font-semibold text-ivory focus:outline-none sm:text-[2.6rem] rtl:leading-snug"
        >
          {t("title")}
        </h2>
        <Ornament className="mx-auto mt-5 h-4 w-40 text-gold-bright" />
        <p className="mx-auto mt-5 max-w-xl text-mist">{t("lead")}</p>

        <div className="mx-auto mt-10 grid max-w-3xl items-start gap-6 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
          <BlendSide
            label={t("westernLabel")}
            icon={<SignIcon sign={signs.sun_sign} size="xl" />}
            name={sign}
            detail={
              <span className="inline-flex items-center gap-2">
                <Sparkle className="size-3 text-gold-light" />
                {t("signDetail", {
                  modality: t(`signModalities.${qualities.modality}`),
                  element: t(`signElements.${qualities.element}`),
                })}
              </span>
            }
          />
          <div
            aria-hidden="true"
            className="flex items-center justify-center gap-3 self-center sm:flex-col"
          >
            <span className="h-px w-14 bg-gold-light/35 sm:h-14 sm:w-px" />
            <YinYang className="size-9 text-gold-light" />
            <span className="h-px w-14 bg-gold-light/35 sm:h-14 sm:w-px" />
          </div>
          <BlendSide
            label={t("chineseLabel")}
            icon={<AnimalIcon animal={signs.year_animal} size="xl" />}
            name={animal}
            detail={
              <span className="inline-flex items-center gap-2">
                <ElementIcon element={signs.year_element} size="sm" className="size-6 text-sm" />
                {t("elementPolarity", { polarity, element })}
              </span>
            }
          />
        </div>
      </Card>

      {signs.sun_sign_alternative || signs.year_animal_alternative ? (
        <div className="space-y-3">
          {signs.sun_sign_alternative ? (
            <Alert tone="info" title={t("cuspTitle")}>
              {t("sunCusp", { sign, alternative: tz(`signs.${signs.sun_sign_alternative}`) })}{" "}
              {t("exactTime")}
            </Alert>
          ) : null}
          {signs.year_animal_alternative ? (
            <Alert tone="info" title={t("boundaryTitle")}>
              {t("yearCusp", {
                animal,
                alternative: tz(`animals.${signs.year_animal_alternative}`),
              })}{" "}
              {t("exactTime")}
            </Alert>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="free-readings-title">
        <h2 id="free-readings-title" className="sr-only">
          {t("readingsTitle")}
        </h2>
        <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
          <ReadingCard
            eyebrow={tz("labels.western")}
            icon={<SignIcon sign={signs.sun_sign} size="md" />}
            fallbackTitle={sign}
            reading={signReading}
            missing={t("missingReading")}
          />
          <ReadingCard
            eyebrow={tz("labels.chinese")}
            icon={<AnimalIcon animal={signs.year_animal} size="md" />}
            fallbackTitle={animal}
            reading={animalReading}
            missing={t("missingReading")}
          />
        </div>
      </section>

      <Card
        variant="featured"
        padding="none"
        data-tone="night"
        className="isolate overflow-hidden px-6 py-10 sm:px-12 sm:py-12"
      >
        <StarField density="low" seed={31} className="-z-10 rounded-2xl opacity-70" />
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div className="text-center md:text-start">
            <p className="eyebrow">{t("ctaEyebrow")}</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold text-ivory sm:text-4xl">
              {t("ctaTitle")}
            </h2>
            <p className="mt-4 max-w-xl text-mist max-md:mx-auto">{t("ctaBody")}</p>
          </div>
          <div className="flex flex-col items-center gap-3 md:items-end">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-semibold text-gold-gradient" dir="ltr">
                {priceLabel}
              </span>
              <span className="text-sm text-mist">{tc("oneTime")}</span>
            </p>
            <Button href="/reading" size="lg" icon={<ArrowIcon />} className="max-sm:w-full">
              {t("ctaButton")}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex justify-center">
        <Button variant="outline" onClick={onRestart} icon={<Sparkle className="size-3" />}>
          {t("startAgain")}
        </Button>
      </div>
    </div>
  );
}

function BlendSide({
  label,
  icon,
  name,
  detail,
}: {
  label: string;
  icon: ReactNode;
  name: string;
  detail: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-gold-light drop-shadow-[0_0_18px_rgb(199_137_51/0.45)]">{icon}</span>
      <p className="mt-4 text-xs font-semibold tracking-[0.14em] text-gold-light/90 uppercase rtl:text-sm rtl:tracking-normal">
        {label}
      </p>
      <p className="mt-1 font-serif text-4xl font-semibold text-ivory sm:text-[2.75rem]">{name}</p>
      <p className="mt-2 flex min-h-6 items-center text-sm text-mist">{detail}</p>
    </div>
  );
}

function ReadingCard({
  eyebrow,
  icon,
  fallbackTitle,
  reading,
  missing,
}: {
  eyebrow: string;
  icon: ReactNode;
  fallbackTitle: string;
  reading: ReadingBlock | null;
  missing: string;
}) {
  return (
    <Card as="article" padding="lg" className="h-full">
      <header className="flex items-center gap-4 border-b border-line pb-5">
        {icon}
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="mt-1 font-serif text-2xl leading-snug font-semibold text-fg">
            {reading?.title ?? fallbackTitle}
          </h3>
        </div>
      </header>
      {reading ? (
        <div
          className="prose-zb mt-6"
          // Sanitised by the API (app.markdown.render_markdown).
          dangerouslySetInnerHTML={{ __html: reading.body_html }}
        />
      ) : (
        <p className="mt-6 text-muted">{missing}</p>
      )}
    </Card>
  );
}
