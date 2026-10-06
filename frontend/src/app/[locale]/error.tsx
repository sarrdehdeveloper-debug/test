"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Ornament } from "@/components/decor/Ornament";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      data-tone="night"
      className="relative isolate flex min-h-[70vh] items-center overflow-hidden bg-night-sky"
    >
      <Container size="narrow" className="py-24 text-center">
        <h1 className="font-serif text-4xl font-semibold text-ivory sm:text-5xl">{t("title")}</h1>
        <Ornament className="mx-auto mt-6 h-4 w-40 text-gold-bright" />
        <p className="mx-auto mt-6 max-w-lg text-lg text-mist">{t("body")}</p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-mist/60" dir="ltr">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => retry()}>{t("retry")}</Button>
          <Button href="/" variant="outline">
            {t("home")}
          </Button>
        </div>
      </Container>
    </section>
  );
}
