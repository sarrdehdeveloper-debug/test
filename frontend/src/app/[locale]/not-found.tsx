import { getTranslations } from "next-intl/server";
import { Ornament } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <section data-tone="night" className="relative isolate flex min-h-[70vh] items-center overflow-hidden bg-night-sky">
      <StarField density="medium" seed={404} className="-z-10" />
      <Container size="narrow" className="py-24 text-center">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold text-ivory sm:text-5xl">{t("title")}</h1>
        <Ornament className="mx-auto mt-6 h-4 w-40 text-gold-bright" />
        <p className="mx-auto mt-6 max-w-lg text-lg text-mist">{t("body")}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/">{t("home")}</Button>
          <Button href="/free" variant="outline">
            {t("free")}
          </Button>
        </div>
      </Container>
    </section>
  );
}
