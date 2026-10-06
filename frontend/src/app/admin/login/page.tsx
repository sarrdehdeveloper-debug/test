import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Ornament } from "@/components/decor/Ornament";
import { StarField } from "@/components/decor/StarField";
import { Skeleton } from "@/components/admin/QueryState";
import { Toaster } from "@/components/admin/Toaster";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

function LoginFormFallback() {
  return (
    <div
      className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-card sm:p-8"
      aria-hidden="true"
    >
      <Skeleton className="h-7 w-32" />
      <Skeleton className="mt-3 h-4 w-56" />
      <Skeleton className="mt-8 h-10 w-full" />
      <Skeleton className="mt-4 h-10 w-full" />
      <Skeleton className="mt-6 h-11 w-full rounded-lg" />
    </div>
  );
}

/** /admin/login — email + password, then a TOTP step for accounts with two-factor enabled. */
export default function AdminLoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside
        data-tone="night"
        className="relative isolate flex flex-col items-center justify-center overflow-hidden bg-night-sky px-6 py-10 text-center lg:min-h-dvh lg:py-16"
      >
        <StarField density="medium" seed={2026} className="-z-10" />
        <Image
          src="/brand/emblem-128.png"
          alt=""
          width={128}
          height={128}
          priority
          className="size-16 drop-shadow-[0_0_24px_rgb(199_137_51/0.45)] lg:size-28"
        />
        <p className="mt-4 font-display text-xl font-semibold tracking-[0.14em] text-gold-gradient lg:mt-6 lg:text-3xl">
          ZODIAC BLEND
        </p>
        <Ornament className="mx-auto mt-3 h-3 w-32 text-gold-bright lg:mt-4 lg:h-4 lg:w-44" />
        <p className="mt-3 font-serif text-lg text-ivory/90 italic lg:mt-4 lg:text-2xl">
          Two Traditions. One Truth.
        </p>
        <p className="mt-2 hidden max-w-sm text-sm text-mist/80 lg:block">
          Orders, reports, prompts and every word of the site, in one calm place.
        </p>
      </aside>
      <main className="flex items-start justify-center px-4 py-10 sm:items-center sm:py-16">
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
      </main>
      <Toaster />
    </div>
  );
}
