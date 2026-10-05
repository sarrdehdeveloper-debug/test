"use client";

import "./globals.css";

/** Last-resort error UI (errors in the root layout). Renders its own document; bilingual. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" dir="ltr">
      <body data-tone="night" className="bg-night-sky">
        <title>Zodiac Blend</title>
        <main className="flex min-h-dvh items-center justify-center px-4 text-center">
          <div>
            <h1 className="font-serif text-4xl font-semibold text-ivory">Something went wrong</h1>
            <p lang="ar" dir="rtl" className="mt-3 font-serif text-2xl text-gold-light">
              حدث خطأ ما
            </p>
            <button
              type="button"
              onClick={() => retry()}
              className="mt-10 inline-flex h-11 items-center justify-center rounded-full bg-gold-soft-gradient px-6 font-semibold text-night"
            >
              Try again · حاول مرة أخرى
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
