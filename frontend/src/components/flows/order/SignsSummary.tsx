"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { AnimalIcon } from "@/components/zodiac/AnimalIcon";
import { SignIcon } from "@/components/zodiac/SignIcon";
import type { OrderSigns } from "@/lib/types";

/** Sun / Moon / Ascendant and year / month / day animals of a paid order. */
export function SignsSummary({ signs, className }: { signs: OrderSigns; className?: string }) {
  const t = useTranslations("flows.signs");
  const tz = useTranslations("zodiac");

  const western: { label: string; value: OrderSigns["sun"] }[] = [
    { label: tz("labels.sun"), value: signs.sun },
    { label: tz("labels.moon"), value: signs.moon },
    { label: tz("labels.ascendant"), value: signs.ascendant },
  ];
  const chinese: { label: string; value: OrderSigns["year_animal"] }[] = [
    { label: tz("labels.yearAnimal"), value: signs.year_animal },
    { label: tz("labels.monthAnimal"), value: signs.month_animal },
    { label: tz("labels.dayAnimal"), value: signs.day_animal },
  ];

  return (
    <Card as="section" aria-labelledby="signs-title" padding="lg" className={className}>
      <h2 id="signs-title" className="font-serif text-2xl font-semibold text-fg">
        {t("title")}
      </h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-8">
        <SignColumn title={t("western")}>
          {western.map(({ label, value }) => (
            <SignRow
              key={label}
              label={label}
              name={value ? tz(`signs.${value}`) : "—"}
              icon={value ? <SignIcon sign={value} size="sm" /> : <EmptyBadge />}
            />
          ))}
        </SignColumn>
        <SignColumn title={t("chinese")}>
          {chinese.map(({ label, value }) => (
            <SignRow
              key={label}
              label={label}
              name={value ? tz(`animals.${value}`) : "—"}
              icon={value ? <AnimalIcon animal={value} size="sm" /> : <EmptyBadge />}
            />
          ))}
        </SignColumn>
      </div>
    </Card>
  );
}

function SignColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-3 divide-y divide-line">{children}</ul>
    </div>
  );
}

function SignRow({ label, name, icon }: { label: string; name: string; icon: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      {icon}
      <p className="flex min-w-0 flex-col">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-serif text-xl leading-tight font-semibold text-fg">{name}</span>
      </p>
    </li>
  );
}

function EmptyBadge() {
  return (
    <span
      aria-hidden="true"
      className="size-9 shrink-0 rounded-full border border-dashed border-line"
    />
  );
}
