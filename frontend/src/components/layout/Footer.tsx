import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { StarField } from "@/components/decor/StarField";
import { Container } from "@/components/ui/Container";
import { Link } from "@/i18n/navigation";
import { getSiteContent } from "@/lib/content";
import { LEGAL_NAV, MAIN_NAV } from "@/lib/site";
import { LanguageSwitcher } from "./LanguageSwitcher";

function telHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/** Site footer: logo & tagline, navigation, legal links, company details (from site content). */
export async function Footer() {
  const locale = await getLocale();
  const [t, tf, content] = await Promise.all([
    getTranslations("nav"),
    getTranslations("footer"),
    getSiteContent(locale),
  ]);
  const company = content.t("company.name");
  const address = content.t("company.address");
  const phone = content.t("company.phone");
  const email = content.t("company.email");
  const year = new Date().getUTCFullYear();

  const linkClass = "text-mist transition-colors hover:text-gold-light";
  const creditLinkClass =
    "underline decoration-gold-light/40 underline-offset-2 transition-colors hover:text-gold-light";
  const headingClass = "eyebrow mb-5";

  return (
    <footer data-tone="night" className="relative isolate overflow-hidden bg-night-deep">
      <hr aria-hidden="true" className="rule-gold" />
      <StarField density="low" seed={21} className="-z-10 opacity-50" />
      <Container
        size="wide"
        className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] lg:gap-10"
      >
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" aria-label={t("homeLink")} className="inline-block rounded-md">
            <Image src="/brand/logo.svg" alt="" width={696} height={661} className="h-auto w-44" />
          </Link>
          <p className="mt-6 max-w-xs font-serif text-xl text-gold-light rtl:text-lg">
            {content.t("footer.tagline")}
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist/80">
            {content.t("legal.disclaimer")}
          </p>
        </div>

        <nav aria-label={t("footer")}>
          <h2 className={headingClass}>{tf("explore")}</h2>
          <ul className="space-y-3 text-[0.95rem]">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass}>
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className={headingClass}>{tf("legal")}</h2>
          <ul className="space-y-3 text-[0.95rem]">
            {LEGAL_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClass}>
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className={headingClass}>{tf("company")}</h2>
          <address className="space-y-3 text-[0.95rem] not-italic">
            <p className="font-semibold text-ivory">{company}</p>
            {address ? (
              <p className="text-mist">
                <span className="sr-only">{tf("address")}: </span>
                <bdi>{address}</bdi>
              </p>
            ) : null}
            {phone ? (
              <p>
                <span className="sr-only">{tf("phone")}: </span>
                <a href={telHref(phone)} dir="ltr" className={linkClass}>
                  {phone}
                </a>
              </p>
            ) : null}
            {email ? (
              <p>
                <span className="sr-only">{tf("email")}: </span>
                <a href={`mailto:${email}`} dir="ltr" className={linkClass}>
                  {email}
                </a>
              </p>
            ) : null}
          </address>
        </div>
      </Container>

      <div className="border-t border-gold-light/10">
        <Container
          size="wide"
          className="flex flex-col items-center justify-between gap-4 py-6 text-center text-sm text-mist/80 md:flex-row md:text-start"
        >
          <div className="space-y-1.5">
            <p>{tf("rights", { year, company })}</p>
            {/* Required attribution: city & coordinate data come from GeoNames (CC BY 4.0). */}
            <p className="text-xs text-mist/70">
              {tf.rich("geonames", {
                geonames: (chunks) => (
                  <a href="https://www.geonames.org/" dir="ltr" className={creditLinkClass}>
                    {chunks}
                  </a>
                ),
                license: (chunks) => (
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    rel="license"
                    dir="ltr"
                    className={creditLinkClass}
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
          <LanguageSwitcher variant="inline" />
        </Container>
      </div>
    </footer>
  );
}
