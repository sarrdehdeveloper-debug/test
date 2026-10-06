"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Combobox, Field, Select } from "@/components/ui/form";
import { api } from "@/lib/api/client";
import { toCountryOption, type CountryOption } from "@/lib/flows/geo";
import type { City, Country, ItemsResponse } from "@/lib/types";

export interface BirthplaceFieldsProps {
  /** Countries rendered on the server; null when the API was unavailable (fetched here then). */
  initialCountries: CountryOption[] | null;
  country: string;
  city: City | null;
  onCountryChange: (code: string) => void;
  onCityChange: (city: City | null) => void;
  countryError?: string;
  cityError?: string;
  disabled?: boolean;
}

/**
 * Country select + async city search. For single-time-zone countries the capital is preselected
 * (client brief) but any other city can be chosen; the Ascendant needs the real birthplace.
 */
export function BirthplaceFields({
  initialCountries,
  country,
  city,
  onCountryChange,
  onCityChange,
  countryError,
  cityError,
  disabled = false,
}: BirthplaceFieldsProps) {
  const t = useTranslations("reading.fields");
  const tForm = useTranslations("form");
  const locale = useLocale();

  const [countries, setCountries] = useState<CountryOption[] | null>(initialCountries);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    initialCountries ? "idle" : "loading",
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [capitalPreselected, setCapitalPreselected] = useState(false);
  const capitalRequest = useRef<AbortController | null>(null);

  // Fallback: the server could not fetch the list (API down during the static render).
  useEffect(() => {
    if (initialCountries) return;
    const controller = new AbortController();
    api
      .get<ItemsResponse<Country>>("/geo/countries", { locale, signal: controller.signal })
      .then((data) => {
        setCountries(data.items.map(toCountryOption));
        setLoadState("idle");
      })
      .catch((err) => {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, [initialCountries, locale, reloadKey]);

  useEffect(() => () => capitalRequest.current?.abort(), []);

  const handleCountry = (code: string) => {
    capitalRequest.current?.abort();
    capitalRequest.current = null;
    setCapitalPreselected(false);
    onCountryChange(code);
    onCityChange(null);
    const selected = countries?.find((c) => c.code === code);
    if (!selected?.singleZone || !selected.capitalId) return;
    const controller = new AbortController();
    capitalRequest.current = controller;
    // Without a query the API lists the capital first.
    api
      .get<ItemsResponse<City>>("/geo/cities", {
        query: { country: code, limit: 1 },
        locale,
        signal: controller.signal,
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const capital = data.items.find((item) => item.id === selected.capitalId);
        if (capital) {
          onCityChange(capital);
          setCapitalPreselected(true);
        }
      })
      .catch(() => {
        /* the visitor can still search the city */
      });
  };

  const handleCity = (next: City | null) => {
    capitalRequest.current?.abort();
    setCapitalPreselected(false);
    onCityChange(next);
  };

  const loadCities = useCallback(
    (q: string, signal: AbortSignal) =>
      api
        .get<ItemsResponse<City>>("/geo/cities", {
          query: { country, q, limit: 20 },
          locale,
          signal,
        })
        .then((data) => data.items),
    [country, locale],
  );

  const cityHint = (
    <>
      {capitalPreselected ? t("cityCapitalHint") : tForm("hints.birthCity")}
      {city ? (
        <span className="mt-0.5 block" dir="auto">
          {t("cityTimezone", { zone: city.timezone.replace(/_/g, " ") })}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label={tForm("labels.birthCountry")} error={countryError} required>
        <Select
          name="country"
          autoComplete="country"
          value={country}
          disabled={disabled || loadState !== "idle" || !countries}
          placeholder={
            loadState === "loading" ? t("countryLoading") : tForm("placeholders.country")
          }
          onChange={(event) => handleCountry(event.target.value)}
        >
          {(countries ?? []).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tForm("labels.birthCity")} error={cityError} hint={cityHint} required>
        <Combobox<City>
          key={country || "none"}
          name="city"
          value={city}
          onChange={handleCity}
          loadOptions={loadCities}
          getOptionKey={(c) => c.id}
          getOptionLabel={(c) => c.label}
          renderOption={(c) => (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{c.name}</span>
              {c.admin1 ? <span className="truncate text-sm text-ink-soft">{c.admin1}</span> : null}
            </span>
          )}
          disabled={disabled || !country}
          placeholder={country ? tForm("placeholders.city") : t("cityPlaceholderDisabled")}
        />
      </Field>
      {loadState === "error" ? (
        <Alert
          tone="error"
          className="sm:col-span-2"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLoadState("loading");
                setReloadKey((k) => k + 1);
              }}
            >
              {t("retry")}
            </Button>
          }
        >
          {t("countryError")}
        </Alert>
      ) : null}
    </div>
  );
}
