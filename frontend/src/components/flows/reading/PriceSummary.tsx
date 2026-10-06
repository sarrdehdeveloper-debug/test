"use client";

import { useLocale, useTranslations } from "next-intl";
import type { PriceBreakdown } from "@/lib/flows/discount";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/** Order total with the applied discount; `pending` dims it while a code is being checked. */
export function PriceSummary({ price, pending }: { price: PriceBreakdown; pending: boolean }) {
  const t = useTranslations("reading.summary");
  const locale = useLocale();
  const money = (cents: number) => formatMoney(cents, price.currency, locale);

  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        "rounded-2xl border border-line bg-parchment/55 px-5 py-4 transition-opacity sm:px-6",
        pending && "opacity-60",
      )}
    >
      <p className="eyebrow">{t("title")}</p>
      <dl className="mt-3 space-y-2 text-[0.95rem]">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fg">{t("item")}</dt>
          <dd
            className={cn("tabular-nums", price.discountCents > 0 && "text-muted line-through")}
            dir="ltr"
          >
            {money(price.listCents)}
          </dd>
        </div>
        {price.discountCents > 0 ? (
          <div className="flex items-baseline justify-between gap-4 text-success">
            <dt>{t("discount", { code: price.code ?? "" })}</dt>
            <dd className="tabular-nums" dir="ltr">
              −{money(price.discountCents)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <dt className="font-semibold text-fg">{t("total")}</dt>
          <dd
            className="font-display text-2xl font-semibold text-gold-deep tabular-nums"
            dir="ltr"
            aria-live="polite"
          >
            {money(price.totalCents)}
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-muted">{t("oneTime")}</p>
    </div>
  );
}
