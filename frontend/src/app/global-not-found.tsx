import "./fonts";
import "./globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import { Ornament } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";

export const metadata: Metadata = {
  title: "Page not found | Zodiac Blend",
};

/**
 * 404 for URLs that match no route (outside /en and /ar). Bypasses the locale layout, so it is
 * bilingual and uses plain links.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body data-tone="night" className="bg-night-sky">
        <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 text-center">
          <StarField density="medium" seed={404} className="-z-10" />
          <div>
            <p className="eyebrow">404</p>
            <h1 className="mt-4 font-serif text-4xl font-semibold text-ivory sm:text-5xl">
              This page is lost among the stars
            </h1>
            <p lang="ar" dir="rtl" className="mt-3 font-serif text-3xl text-gold-light">
              تاهت هذه الصفحة بين النجوم
            </p>
            <Ornament className="mx-auto mt-6 h-4 w-40 text-gold-bright" />
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/en"
                className="inline-flex h-11 items-center justify-center rounded-full bg-gold-soft-gradient px-6 font-semibold text-night"
              >
                Back to home
              </Link>
              <Link
                href="/ar"
                lang="ar"
                className="inline-flex h-11 items-center justify-center rounded-full border border-gold-bright/70 px-6 font-semibold text-ivory"
              >
                العودة إلى الرئيسية
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
