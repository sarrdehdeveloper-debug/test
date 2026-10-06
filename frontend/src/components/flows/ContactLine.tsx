"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** "Need help? Write to us at …" with the editable company email (or the contact page). */
export function ContactLine({ email, className }: { email: string; className?: string }) {
  const t = useTranslations("flows");
  const linkClass = "font-semibold text-accent underline underline-offset-2";
  return (
    <p className={cn("text-sm text-muted", className)}>
      {email
        ? t.rich("contact", {
            email,
            link: (chunks) => (
              <a href={`mailto:${email}`} className={linkClass} dir="ltr">
                {chunks}
              </a>
            ),
          })
        : t.rich("contactPage", {
            link: (chunks) => (
              <Link href="/contact" className={linkClass}>
                {chunks}
              </Link>
            ),
          })}
    </p>
  );
}
