import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StarField } from "@/components/decor/StarField";
import { CopyButton } from "@/components/pages/CopyButton";
import { isolateLtrNumbers } from "@/components/pages/helpers/html";
import { PageHero } from "@/components/pages/PageHero";
import { ArrowIcon, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;

/** "+1-307-443-6533" -> "tel:+13074436533". */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const [tNav, t] = await Promise.all([getTranslations("nav"), getTranslations("contactPage")]);
  return pageMetadata({
    locale,
    path: "/contact",
    title: tNav("contact"),
    description: t("description"),
  });
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full border border-gold-light/30 bg-white/5 text-gold-light"
      >
        <svg
          viewBox="0 0 20 20"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
      </span>
      <div className="min-w-0 pt-0.5">
        <dt className="font-display text-[0.7rem] font-semibold tracking-[0.16em] text-gold-light/90 uppercase rtl:text-sm rtl:tracking-normal">
          {label}
        </dt>
        <dd className="mt-1 text-ivory">{children}</dd>
      </div>
    </div>
  );
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  const [c, tNav, t, ts, tf, tc] = await Promise.all([
    getSiteContent(locale),
    getTranslations("nav"),
    getTranslations("contactPage"),
    getTranslations("pagesShared"),
    getTranslations("footer"),
    getTranslations("common"),
  ]);
  const company = c.t("company.name");
  const address = c.t("company.address");
  const phone = c.t("company.phone");
  const email = c.t("company.email");
  // Phone numbers in Arabic copy must stay left-to-right.
  const body = isolateLtrNumbers(c.html("contact.body"));
  const title = tNav("contact");
  const linkClass =
    "font-medium text-ivory underline decoration-gold-light/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-current";

  return (
    <>
      <PageHero
        id="contact-title"
        seed={33}
        eyebrow={t("eyebrow")}
        title={title}
        lead={t("lead")}
        breadcrumbs={[{ label: ts("home"), href: "/" }, { label: title }]}
        breadcrumbLabel={ts("breadcrumb")}
      />

      <Section tone="ivory">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-12">
          <Card padding="lg" className="min-w-0">
            <div
              className="prose-zb text-[1.0625rem] rtl:text-[1.15rem] rtl:leading-[2] [&>p:first-child]:font-serif [&>p:first-child]:text-[1.4rem] [&>p:first-child]:leading-snug [&>p:first-child]:text-fg rtl:[&>p:first-child]:leading-[1.8]"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          </Card>

          <aside
            aria-labelledby="contact-details"
            data-tone="night"
            className="relative isolate overflow-hidden rounded-3xl border border-gold-light/25 bg-night-sky p-7 shadow-glow sm:p-9"
          >
            <StarField density="low" seed={8} className="-z-10" />
            <p className="eyebrow">{t("detailsTitle")}</p>
            <h2 id="contact-details" className="mt-3 font-serif text-3xl font-semibold text-ivory">
              {company}
            </h2>
            <dl className="mt-8 space-y-6">
              {email ? (
                <DetailRow
                  label={tf("email")}
                  icon={
                    <>
                      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
                      <path d="m3 5.5 7 5.5 7-5.5" />
                    </>
                  }
                >
                  <span className="flex flex-wrap items-center gap-1">
                    <a href={`mailto:${email}`} dir="ltr" className={`${linkClass} break-all`}>
                      {email}
                    </a>
                    <CopyButton
                      value={email}
                      label={t("copyEmail")}
                      copiedLabel={t("emailCopied")}
                      failedLabel={ts("copyFailed")}
                    />
                  </span>
                </DetailRow>
              ) : null}
              {phone ? (
                <DetailRow
                  label={tf("phone")}
                  icon={
                    <path d="M6.6 3.5H4.5a1 1 0 0 0-1 1.1A13 13 0 0 0 15.4 16.5a1 1 0 0 0 1.1-1v-2.1a1 1 0 0 0-.8-1l-2.5-.6a1 1 0 0 0-1 .3l-1 1.1a10 10 0 0 1-4.3-4.3l1.1-1a1 1 0 0 0 .3-1l-.6-2.5a1 1 0 0 0-1.1-.9Z" />
                  }
                >
                  <a href={telHref(phone)} dir="ltr" className={linkClass}>
                    {phone}
                  </a>
                </DetailRow>
              ) : null}
              {address ? (
                <DetailRow
                  label={tf("address")}
                  icon={
                    <>
                      <path d="M10 17.5s5.5-4.6 5.5-9a5.5 5.5 0 0 0-11 0c0 4.4 5.5 9 5.5 9Z" />
                      <circle cx="10" cy="8.5" r="2" />
                    </>
                  }
                >
                  <address className="leading-relaxed text-mist not-italic">
                    <bdi>{company}</bdi>
                    <br />
                    <bdi>{address}</bdi>
                  </address>
                </DetailRow>
              ) : null}
            </dl>
            {email || phone ? (
              <div className="mt-9 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                {email ? (
                  <a href={`mailto:${email}`} className={buttonClasses({ className: "flex-1" })}>
                    {t("writeToUs")}
                  </a>
                ) : null}
                {phone ? (
                  <a
                    href={telHref(phone)}
                    className={buttonClasses({ variant: "outline", className: "flex-1" })}
                  >
                    {t("callUs")}
                  </a>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </Section>

      <Section tone="parchment" spacing="sm" aria-labelledby="contact-policies">
        <h2
          id="contact-policies"
          className="text-center font-serif text-3xl font-semibold text-fg lg:text-start"
        >
          {t("policiesTitle")}
        </h2>
        <ul className="mt-8 grid gap-5 md:grid-cols-2">
          {(
            [
              { href: "/privacy", title: tNav("privacy"), body: t("privacyBody") },
              { href: "/terms", title: tNav("terms"), body: t("termsBody") },
            ] as const
          ).map((item) => (
            <li key={item.href}>
              <Card padding="md" interactive className="group h-full">
                <h3 className="font-serif text-2xl font-semibold text-fg">
                  <Link
                    href={item.href}
                    className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none group-focus-within:underline"
                  >
                    {item.title}
                  </Link>
                </h3>
                <p className="mt-2 text-muted">{item.body}</p>
                <span
                  aria-hidden="true"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent"
                >
                  {tc("readMore")}
                  <ArrowIcon />
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
