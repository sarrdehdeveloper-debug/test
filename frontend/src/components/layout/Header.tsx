import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Link } from "@/i18n/navigation";
import { MAIN_NAV } from "@/lib/site";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";
import { SiteLogo } from "./SiteLogo";

/** Sticky site header: logo, main navigation, language switcher, CTA, mobile menu. */
export async function Header() {
  const t = await getTranslations("nav");
  const tMeta = await getTranslations("meta");
  const items = MAIN_NAV.map((item) => ({ href: item.href, label: t(item.key) }));

  return (
    <header
      data-tone="night"
      className="sticky top-0 z-40 border-b border-gold-light/15 bg-night/90 backdrop-blur-md supports-[backdrop-filter]:bg-night/80"
    >
      <Container size="wide" className="flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
        <Link href="/" aria-label={t("homeLink")} className="shrink-0 rounded-md">
          <SiteLogo withSlogan slogan={tMeta("slogan")} />
        </Link>

        <nav aria-label={t("main")} className="hidden lg:block">
          <ul className="flex items-center gap-0.5 xl:gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  className="relative block rounded-md px-2.5 py-2 font-display text-[0.78rem] font-semibold tracking-[0.1em] text-ivory/85 uppercase transition-colors after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-px after:origin-center after:scale-x-0 after:bg-gold-gradient after:transition-transform after:duration-300 hover:text-gold-light hover:after:scale-x-100 aria-[current=page]:text-gold-light aria-[current=page]:after:scale-x-100 xl:px-3 rtl:text-[1.02rem] rtl:tracking-normal"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:flex" />
          <Button href="/reading" size="sm" className="hidden xl:inline-flex">
            {t("cta")}
          </Button>
          <MobileMenu
            items={items}
            labels={{ open: t("openMenu"), close: t("closeMenu"), nav: t("main"), cta: t("cta") }}
          />
        </div>
      </Container>
    </header>
  );
}
